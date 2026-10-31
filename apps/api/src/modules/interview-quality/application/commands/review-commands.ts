import {
  conductRoles,
  err,
  fromPlaceholders,
  isGenericLabel,
  makeChunks,
  newId,
  ok,
  type Person,
  type Result,
  withPlaceholders,
} from '@goodresearch/shared'
import {
  checkAnswer,
  type FoundRemark,
  mergeReview,
  type SentAnswer,
} from '../../domain/remarks.ts'
import {
  interruptedReview,
  isReviewLive,
  type ReviewFailure,
  type ReviewProgress,
  type ReviewRun,
  reviewRef,
} from '../../domain/review-run.ts'
import { cutSentences, type Sentence } from '../../domain/sentences.ts'
import { isMeasurable, speakingTimes } from '../../domain/speaking-times.ts'
import { interviewsNow, type StudyError, studyOf } from '../interviews.ts'
import {
  AiFailed,
  AiUnavailable,
  type AnalysedText,
  type QualityDeps,
  type ReviewJob,
  type ReviewRequest,
  type SpeakerCount,
  type StoredReformulation,
  type StoredRemark,
} from '../ports.ts'

/** A part is tried twice before the interview fails (FR-013). */
const ATTEMPTS = 2
/** As spec 012: 3 interviews at once, 2 parts of an interview at once. */
const INTERVIEWS_PARALLEL = 3
const CHUNKS_PARALLEL = 2
/** The prompt around each call. */
const CALL_OVERHEAD_CHARS = 2_500
/**
 * PROVISIONAL (research R10): tokens of one part's answer. On the reference set, a single short
 * excerpt took 874 on average, so a part of 60 turns takes more; half of `maxOutputTokens` until a
 * real interview calibrates it.
 */
const PROVISIONAL_ANSWER_TOKENS = 4_000

const REASON_MAX = 200

export type StartError =
  | StudyError
  | 'AI_PROVIDER_REQUIRED'
  | 'ENRICHMENT_RUNNING'
  | 'FACTS_RUNNING'
  | 'QUALITY_RUNNING'
  | 'QUALITY_CONSENT_REQUIRED'
  | 'NOTHING_TO_REVIEW'

/** What the AI sees of a speaker: never a label, only its role and code (FR-014). */
const speakerSent = (role: { role: string; participant: string | null }) =>
  role.role === 'interviewer'
    ? 'interviewer'
    : role.participant
      ? `interviewee ${role.participant}`
      : 'unknown speaker'

export const makeReviewCommands = (deps: QualityDeps) => {
  const now = () => deps.clock.now()

  /** The study's open run, if live; a dead one is closed (its interviews interrupted). */
  const liveRun = async (studyId: string) => {
    const run = await deps.store.openRun(studyId)
    if (!run) return null
    if (isReviewLive(run, now())) return run
    await deps.store.saveRun(interruptedReview(run, now()))
    return null
  }

  const targets = async (
    accountId: string,
    studyId: string,
    input: { all: boolean; sessionIds?: readonly string[] | undefined },
  ) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const { access, sessions } = study.value
    const chosen = input.sessionIds
      ? sessions.filter((s) => input.sessionIds?.includes(s.id))
      : sessions
    const runs = await deps.store.runsOf(studyId)
    const interviews = await interviewsNow(deps, accountId, studyId, access, chosen, runs)
    const open = interviews.filter(
      (i) =>
        i.text !== null &&
        // Without an interviewer's word, there is nothing to read until a person attributes one.
        i.times.words.interviewers > 0 &&
        (input.sessionIds !== undefined ||
          (i.measurable &&
            (input.all || i.state === 'not-reviewed' || i.state === 'to-review-again'))),
    )
    // An interview never imported has no text yet: the run imports it first.
    const notImported = interviews.filter((i) => i.notImported)
    return ok({ interviews: open, notImported })
  }

  const textChars = (text: AnalysedText) =>
    makeChunks(text.turns).reduce(
      (n, c) => n + CALL_OVERHEAD_CHARS + c.turns.reduce((m, t) => m + t.text.length, 0),
      0,
    )

  /** FR-013: the interviews, parts and cost a review would take. */
  const estimate = async (
    accountId: string,
    studyId: string,
    input: { all: boolean; sessionId?: string | undefined },
  ) => {
    const found = await targets(accountId, studyId, {
      all: input.all,
      sessionIds: input.sessionId ? [input.sessionId] : undefined,
    })
    if (!found.ok) return found
    const { interviews, notImported } = found.value
    let chunks = 0
    let chars = 0
    for (const i of interviews)
      if (i.text) {
        chunks += makeChunks(i.text.turns).length
        chars += textChars(i.text)
      }
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      interviews: interviews.length + notImported.length,
      chunks,
      cost:
        provider && chunks > 0
          ? await deps.ai.estimate(accountId, chars, chunks * PROVISIONAL_ANSWER_TOKENS, chunks)
          : provider
            ? 0
            : null,
      consentNeeded: provider ? !(await deps.store.hasConsent(accountId, studyId, provider)) : true,
      aiConnected: provider !== null,
    })
  }

  /** Opening an interview to read it brings its transcript, as a run would: no AI, no cost. */
  const importToRead = async (accountId: string, studyId: string, sessionId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return
    const session = study.value.sessions.find((s) => s.id === sessionId)
    if (!session?.transcript) return
    const text = await deps.sources.analysedText(
      accountId,
      studyId,
      sessionId,
      study.value.access.textAnalysed,
    )
    if (text === 'no-transcript')
      await deps.sources.importTranscripts(accountId, studyId, [sessionId])
  }

  const giveConsent = async (accountId: string, studyId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED' as const)
    await deps.store.giveConsent(accountId, studyId, provider, now())
    return ok(undefined)
  }

  /** FR-013, FR-014: one review per study, never with another run of the study, after consent. */
  const start = async (
    accountId: string,
    studyId: string,
    input: { all: boolean; consent: boolean; sessionIds?: readonly string[] | undefined },
  ): Promise<Result<{ runId: string }, StartError>> => {
    const found = await targets(accountId, studyId, input)
    if (!found.ok) return found
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED')
    if (await deps.sources.enrichmentLive(studyId)) return err('ENRICHMENT_RUNNING')
    if (await deps.sources.factsLive(studyId)) return err('FACTS_RUNNING')
    if (await liveRun(studyId)) return err('QUALITY_RUNNING')
    if (!(await deps.store.hasConsent(accountId, studyId, provider))) {
      if (!input.consent) return err('QUALITY_CONSENT_REQUIRED')
      await deps.store.giveConsent(accountId, studyId, provider, now())
    }
    const ids = [
      ...found.value.interviews.map((i) => i.session.id),
      ...found.value.notImported.map((i) => i.session.id),
    ]
    if (ids.length === 0) return err('NOTHING_TO_REVIEW')
    const at = now()
    const run: ReviewRun = {
      id: newId(),
      studyId,
      startedBy: accountId,
      sessions: ids.map((sessionId) => ({ sessionId, state: 'waiting', chunks: 0, chunksDone: 0 })),
      stopRequested: false,
      leftOut: 0,
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.store.startRun(run))) return err('QUALITY_RUNNING')
    // A job of the study still in the queue refuses this one: the run closes, the study is free.
    const anyway = input.sessionIds !== undefined
    if (!(await deps.enqueueRun({ runId: run.id, studyId, anyway }))) {
      await deps.store.saveRun(interruptedReview(run, now()))
      return err('QUALITY_RUNNING')
    }
    return ok({ runId: run.id })
  }

  const stop = async (accountId: string, studyId: string, runId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const run = await deps.store.getRun(runId)
    if (!run || run.studyId !== studyId) return err('NOT_FOUND' as const)
    await deps.store.requestStop(runId)
    return ok(undefined)
  }

  /** The worker's job: each interview part by part; what a finished interview found is kept. */
  const runJob = async (job: ReviewJob): Promise<void> => {
    let run = await deps.store.getRun(job.runId)
    if (!run || run.finishedAt) return
    const by = run.startedBy
    const studyId = run.studyId
    const set = (sessionId: string, change: Partial<ReviewProgress>) => {
      if (!run) return
      run = {
        ...run,
        heartbeatAt: now(),
        sessions: run.sessions.map((s) => (s.sessionId === sessionId ? { ...s, ...change } : s)),
      }
    }
    const save = async () => {
      if (run) await deps.store.saveRun({ ...run, heartbeatAt: now() })
    }
    const stopped = async () => (await deps.store.getRun(job.runId))?.stopRequested === true
    const pending = run.sessions
      .filter((s) => s.state !== 'done' && s.state !== 'failed')
      .map((s) => s.sessionId)
    const access = await deps.sources.studyAccess(by, studyId)
    if (!access) {
      for (const id of pending) set(id, { state: 'failed', failure: 'FILE_NOT_FOUND' })
      run = { ...run, finishedAt: now() }
      await deps.store.saveRun(run)
      return
    }
    const failedImports = await deps.sources.importTranscripts(by, studyId, pending)
    for (const [id, failure] of failedImports)
      set(id, { state: 'failed', failure: failure as ReviewFailure })
    await save()
    const [people, known, context] = await Promise.all([
      deps.sources.people(by, studyId, { assign: true }),
      deps.sources.knownNames(by, studyId),
      deps.sources.context(by, studyId),
    ])
    let providerGone = false

    const readOne = async (sessionId: string): Promise<ReviewFailure | null> => {
      const text = await deps.sources.analysedText(by, studyId, sessionId, access.textAnalysed, {
        assign: true,
      })
      if (text === 'no-transcript') return 'NO_TRANSCRIPT'
      if (text === 'not-clean') return 'NOT_CLEAN'
      const mine: readonly Person[] = people?.[sessionId] ?? []
      const attributions = await deps.sources.speakerAttributions(sessionId)
      const roles = conductRoles(
        text.turns.map((t) => t.speaker),
        mine,
        attributions,
      )
      const roleOf = (label: string | null) =>
        roles.get(label) ?? { role: 'unknown' as const, participant: null }
      const { words } = speakingTimes(text.turns, (label) => roleOf(label).role)
      // Imported by this run, so not looked at when it started: the same rule as `targets`.
      if (words.interviewers === 0) return null
      if (!job.anyway && !isMeasurable(words)) return null

      // Every name the app knows, and the speakers' own labels, become placeholders (FR-014).
      const labels = [...new Set(text.turns.map((t) => t.speaker).filter((s) => s !== null))]
      const names = [
        ...known,
        ...mine.map((p) => p.name),
        ...labels.filter((l) => !isGenericLabel(l)),
      ]
      const hidden = (value: string) => withPlaceholders(value, names).text
      const placeholders = withPlaceholders('', names).names
      const back = (value: string | null) => (value ? fromPlaceholders(value, placeholders) : null)
      // What interviewees said before each turn, for the check of what a reformulation adds.
      const said = new Map<string, string>()
      let earlier = ''
      for (const t of text.turns) {
        said.set(t.id, earlier)
        if (roleOf(t.speaker).role !== 'interviewer') earlier += ` ${t.text}`
      }

      const chunks = makeChunks(text.turns)
      set(sessionId, { state: 'reading', chunks: chunks.length, chunksDone: 0 })
      await save()
      const counts = new Map<string, { sentences: number; questions: number }>()
      const count = (label: string, sentences: number, questions: number) => {
        const c = counts.get(label) ?? { sentences: 0, questions: 0 }
        counts.set(label, {
          sentences: c.sentences + sentences,
          questions: c.questions + questions,
        })
      }
      const skipped = new Set<string>()
      const remarks: StoredRemark[] = []
      const reformulations: StoredReformulation[] = []
      let leftOut = 0
      let failure: ReviewFailure | null = null
      const queue = [...chunks]

      const keep = (
        turn: { segmentId: string; speaker: string | null; offset: number },
        found: { remarks: FoundRemark[]; simple: Sentence[] },
      ) => {
        const label = turn.speaker ?? ''
        for (const s of found.simple)
          reformulations.push({
            id: newId(),
            sessionId,
            studyId,
            segmentId: turn.segmentId,
            offset: turn.offset + s.offset,
            length: s.length,
            text: s.text,
            speakerLabel: label,
            requalifiedRemarkId: null,
          })
        for (const r of found.remarks)
          remarks.push({
            id: newId(),
            sessionId,
            studyId,
            runId: job.runId,
            segmentId: turn.segmentId,
            offset: turn.offset + r.offset,
            length: r.length,
            text: r.text,
            speakerLabel: label,
            kind: r.kind,
            reason: {
              en: (back(r.reason.en) ?? '').slice(0, REASON_MAX),
              fr: (back(r.reason.fr) ?? '').slice(0, REASON_MAX),
            },
            reasonPerson: null,
            recommendation: back(r.recommendation),
            addedElement: back(r.addedElement),
            origin: 'ai',
            stance: null,
            stanceBy: null,
            stanceAt: null,
            version: 1,
          })
      }

      const worker = async () => {
        for (let chunk = queue.shift(); chunk && !failure; chunk = queue.shift()) {
          if (providerGone || (await stopped())) return
          const turns = chunk.turns.map((t) => {
            const role = roleOf(t.speaker)
            const asked = role.role === 'interviewer' && !t.context
            if (role.role === 'unknown' && !t.context) skipped.add(t.segmentId)
            const sentences = asked ? cutSentences(t.id, t.text) : []
            return { turn: t, role, sentences }
          })
          const request: ReviewRequest = {
            goal: hidden(context.goal),
            guide: context.guide.map(hidden),
            turns: turns.map(({ turn, role, sentences }) => ({
              id: turn.id,
              speaker: speakerSent(role),
              text: hidden(turn.text),
              context: turn.context,
              sentences: sentences.map((s) => ({ id: s.id, text: hidden(s.text) })),
            })),
          }
          let answer: readonly SentAnswer[] | null = null
          // Nothing to ask on these turns: no call, no cost.
          if (turns.every((t) => t.sentences.length === 0)) answer = []
          for (let attempt = 1; attempt <= ATTEMPTS && !answer; attempt++) {
            try {
              answer = await deps.ai.review(by, reviewRef(job.runId, sessionId), request)
            } catch (error) {
              if (error instanceof AiUnavailable) {
                providerGone = true
                failure = 'AI_PROVIDER_REQUIRED'
                return
              }
              if (attempt >= ATTEMPTS)
                failure =
                  error instanceof AiFailed && error.invalid ? 'INVALID_ANSWER' : 'AI_FAILED'
            }
          }
          if (!answer) return
          const placed = new Set<string>()
          for (const { turn, sentences } of turns) {
            if (sentences.length === 0) continue
            const mineAnswers = answer
              .filter((a) => a.id.startsWith(`${turn.id}.`))
              .map((a) => withNamesBack(a, back))
            for (const a of mineAnswers) placed.add(a.id)
            const checked = checkAnswer({
              sentences,
              answers: mineAnswers,
              earlierWords: said.get(turn.segmentId) ?? '',
            })
            count(turn.speaker ?? '', sentences.length, checked.questions)
            leftOut += checked.leftOut
            keep(turn, checked)
          }
          // An answer on a turn that holds no sentence sent: the AI made it up.
          leftOut += answer.filter((a) => !placed.has(a.id)).length
          const progress = run?.sessions.find((s) => s.sessionId === sessionId)
          set(sessionId, { chunksDone: (progress?.chunksDone ?? 0) + 1 })
          await save()
        }
      }
      await Promise.all(Array.from({ length: CHUNKS_PARALLEL }, worker))
      if (failure) return failure
      if (providerGone) return 'AI_PROVIDER_REQUIRED'
      if (await stopped()) return 'INTERRUPTED'

      const stored: SpeakerCount[] = [...counts].map(([speakerLabel, c]) => ({
        sessionId,
        studyId,
        speakerLabel,
        ...c,
      }))
      // FR-011: what people said stays, and is neither raised nor counted again.
      const merged = mergeReview({
        remarks,
        reformulations,
        existing: (await deps.store.remarksOf(studyId)).filter((r) => r.sessionId === sessionId),
      })
      await deps.store.replaceReview({
        evaluation: {
          sessionId,
          studyId,
          runId: job.runId,
          rawImportedAt: text.rawImportedAt,
          textAnalysed: access.textAnalysed,
          anonymised: access.anonymised,
          fingerprint: text.fingerprint,
          leftOut,
          turnsSkipped: skipped.size,
          readAt: now(),
        },
        counts: stored,
        reformulations: merged.reformulations,
        remarks: merged.remarks,
      })
      if (run) run = { ...run, leftOut: run.leftOut + leftOut }
      return null
    }

    const queue = pending.filter((id) => !failedImports.has(id))
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (providerGone) {
          set(id, { state: 'failed', failure: 'AI_PROVIDER_REQUIRED' })
          continue
        }
        if (await stopped()) {
          set(id, { state: 'failed', failure: 'INTERRUPTED' })
          continue
        }
        let failure: ReviewFailure | null
        try {
          failure = await readOne(id)
        } catch (error) {
          deps.log.warn({ error: String(error), sessionId: id }, 'interview review failed')
          failure = 'AI_FAILED'
        }
        set(id, failure ? { state: 'failed', failure } : { state: 'done' })
        await save()
      }
    }
    await Promise.all(Array.from({ length: INTERVIEWS_PARALLEL }, worker))
    run = { ...run, finishedAt: now() }
    await deps.store.saveRun(run)
  }

  return { estimate, importToRead, giveConsent, start, stop, runJob, liveRun }
}

/** The AI's answer read back: what the checks compare with the text has the names again. */
const withNamesBack = (a: SentAnswer, back: (value: string | null) => string | null): SentAnswer =>
  a.flag
    ? {
        ...a,
        flag: {
          ...a.flag,
          addedElement: back(a.flag.addedElement),
          excerpt: back(a.flag.excerpt),
        },
      }
    : a

export type ReviewCommands = ReturnType<typeof makeReviewCommands>
