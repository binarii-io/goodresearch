import { err, makeChunks, newId, ok, type Result, withPlaceholders } from '@goodresearch/shared'
import {
  canStopFacts,
  type FactsFailure,
  type FactsProgress,
  type FactsRun,
  factsRef,
  interruptedFactsRun,
  isFactsRunLive,
} from '../../domain/analysis-run.ts'
import { checkFacts, type Fact, isRepeated, isReproposal, type Theme } from '../../domain/facts.ts'
import { isGenericLabel, type Person, speakerRole } from '../../domain/speakers.ts'
import {
  checkVerbatims,
  type FoundVerbatim,
  mergeVerbatims,
  sendTurn,
} from '../../domain/verbatims.ts'
import { interviewsNow, type StudyError, studyOf } from '../interviews.ts'
import {
  AiFailed,
  AiUnavailable,
  type AnalysedText,
  type EvidenceDeps,
  type FactsJob,
  type StoredVerbatim,
} from '../ports.ts'

/** A part is tried twice before the interview fails (FR-012). */
const ATTEMPTS = 2
/** Research R5: 3 interviews at once, 2 parts of an interview at once. */
const INTERVIEWS_PARALLEL = 3
const CHUNKS_PARALLEL = 2
/** Research R5: the fact pass reads at most this many verbatims at once. */
const FACT_BATCH = 150
// The estimate (research R10): the prompt around each call, the answers, the verbatims' share.
const CALL_OVERHEAD_CHARS = 2_500
const VERBATIM_ANSWER_TOKENS = 2_000
const FACT_ANSWER_TOKENS = 3_000
const VERBATIM_SHARE = 0.15

export type StartError =
  | StudyError
  | 'AI_PROVIDER_REQUIRED'
  | 'ENRICHMENT_RUNNING'
  | 'FACTS_RUNNING'
  | 'FACTS_CONSENT_REQUIRED'
  | 'NOTHING_TO_ANALYSE'

/** What the AI sees of a speaker: never a label, only its role and code (FR-007). */
const speakerSent = (role: { role: string; participant: string | null }) =>
  role.role === 'interviewer'
    ? 'interviewer'
    : role.participant
      ? `interviewee ${role.participant}`
      : 'unknown speaker'

export const makeAnalysisCommands = (deps: EvidenceDeps) => {
  const now = () => deps.clock.now()

  /** The study's open run, if live; a dead one is closed (its interviews interrupted). */
  const liveRun = async (studyId: string) => {
    const run = await deps.store.openRun(studyId)
    if (!run) return null
    if (isFactsRunLive(run, now())) return run
    await deps.store.saveRun(interruptedFactsRun(run, now()))
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
    const now = await interviewsNow(deps, accountId, studyId, access, chosen)
    const open = now.filter(
      (i) =>
        i.text !== null &&
        (input.all ||
          input.sessionIds !== undefined ||
          i.state === 'not-analysed' ||
          i.state === 'to-analyse-again'),
    )
    // An interview never imported has no text yet: the run imports it first (FR-003).
    const notImported = now.filter((i) => !i.hasTranscript)
    return ok({ access, interviews: open, notImported })
  }

  const textChars = (text: AnalysedText) =>
    makeChunks(text.turns).reduce(
      (n, c) => n + CALL_OVERHEAD_CHARS + c.turns.reduce((m, t) => m + t.text.length, 0),
      0,
    )

  /** FR-003: the interviews, parts and cost a run would take. */
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
        const c = textChars(i.text)
        chars += c + c * VERBATIM_SHARE + CALL_OVERHEAD_CHARS
      }
    const provider = await deps.ai.providerOf(accountId)
    const calls = chunks + interviews.length
    return ok({
      interviews: interviews.length + notImported.length,
      chunks,
      cost:
        provider && calls > 0
          ? await deps.ai.estimate(
              accountId,
              Math.round(chars),
              chunks * VERBATIM_ANSWER_TOKENS + interviews.length * FACT_ANSWER_TOKENS,
              calls,
            )
          : provider
            ? 0
            : null,
      consentNeeded: provider ? !(await deps.store.hasConsent(accountId, studyId, provider)) : true,
      aiConnected: provider !== null,
    })
  }

  const giveConsent = async (accountId: string, studyId: string) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED' as const)
    await deps.store.giveConsent(accountId, studyId, provider, now())
    return ok(undefined)
  }

  /** FR-003, FR-012, FR-014: one run per study, never with an Enrichment run, after consent. */
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
    if (await liveRun(studyId)) return err('FACTS_RUNNING')
    if (!(await deps.store.hasConsent(accountId, studyId, provider))) {
      if (!input.consent) return err('FACTS_CONSENT_REQUIRED')
      await deps.store.giveConsent(accountId, studyId, provider, now())
    }
    const ids = [
      ...found.value.interviews.map((i) => i.session.id),
      ...found.value.notImported.map((i) => i.session.id),
    ]
    if (ids.length === 0) return err('NOTHING_TO_ANALYSE')
    const at = now()
    const run: FactsRun = {
      id: newId(),
      studyId,
      teamId: found.value.access.teamId,
      startedBy: accountId,
      sessions: ids.map((sessionId) => ({ sessionId, state: 'waiting', chunks: 0, chunksDone: 0 })),
      stopRequested: false,
      stoppedSessions: [],
      leftOut: { verbatims: 0, facts: 0 },
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.store.startRun(run))) return err('FACTS_RUNNING')
    // A job of the study still in the queue refuses this one: the run closes, the study is free.
    if (!(await deps.enqueueRun({ runId: run.id, studyId, all: input.all }))) {
      await deps.store.saveRun(interruptedFactsRun(run, now()))
      return err('FACTS_RUNNING')
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

  /** One interview taken out of a run while its own reading goes on; nothing of it is kept. */
  const stopSession = async (
    accountId: string,
    studyId: string,
    runId: string,
    sessionId: string,
  ) => {
    const study = await studyOf(deps, accountId, studyId)
    if (!study.ok) return study
    const run = await deps.store.getRun(runId)
    if (!run || run.studyId !== studyId || !run.sessions.some((s) => s.sessionId === sessionId))
      return err('NOT_FOUND' as const)
    // Taken out already: the same answer, so a second click is no error.
    if (run.stoppedSessions.includes(sessionId)) return ok(undefined)
    if (!canStopFacts(run, sessionId)) return err('TOO_LATE_TO_STOP' as const)
    if (!(await deps.store.requestSessionStop(runId, sessionId)))
      return err('TOO_LATE_TO_STOP' as const)
    return ok(undefined)
  }

  /** The worker's job (research R5): per interview, verbatims part by part, then facts. */
  const runJob = async (job: FactsJob): Promise<void> => {
    let run = await deps.store.getRun(job.runId)
    if (!run || run.finishedAt) return
    const by = run.startedBy
    const studyId = run.studyId
    const set = (sessionId: string, change: Partial<FactsProgress>) => {
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
    /** The whole run stopped, or this interview taken out of it. */
    const halted = async (sessionId: string): Promise<FactsFailure | null> => {
      const current = await deps.store.getRun(job.runId)
      if (current?.stopRequested) return 'INTERRUPTED'
      return current?.stoppedSessions.includes(sessionId) ? 'STOPPED' : null
    }
    // A job delivered again takes back the interviews left in progress; one taken out before the
    // job started is not even imported.
    const open = run.sessions.filter((s) => s.state !== 'done' && s.state !== 'failed')
    for (const s of open)
      if (run.stoppedSessions.includes(s.sessionId))
        set(s.sessionId, { state: 'failed', failure: 'STOPPED' })
    const pending = open.map((s) => s.sessionId).filter((id) => !run?.stoppedSessions.includes(id))
    const access = await deps.sources.studyAccess(by, studyId)
    if (!access) {
      for (const id of pending) set(id, { state: 'failed', failure: 'FILE_NOT_FOUND' })
      run = { ...run, finishedAt: now() }
      await deps.store.saveRun(run)
      return
    }
    const failedImports = await deps.sources.importTranscripts(by, studyId, pending)
    for (const [id, failure] of failedImports)
      set(id, { state: 'failed', failure: failure as FactsFailure })
    await save()
    const [people, known, context] = await Promise.all([
      deps.sources.people(by, studyId, { assign: true }),
      deps.sources.knownNames(by, studyId),
      deps.sources.context(by, studyId),
    ])
    const themeIds = new Map<string, Theme>([
      ...context.themes.map((t, i) => [`s${i + 1}`, { id: t.id, title: t.title }] as const),
      ['other', null],
    ])
    let providerGone = false

    const readOne = async (sessionId: string): Promise<FactsFailure | null> => {
      const text = await deps.sources.analysedText(by, studyId, sessionId, access.textAnalysed, {
        assign: true,
      })
      if (text === 'no-transcript') return 'NO_TRANSCRIPT'
      if (text === 'not-clean') return 'NOT_CLEAN'
      const mine: readonly Person[] = people?.[sessionId] ?? []
      const attributions = await deps.store.speakersOf(sessionId)
      const roleOf = (label: string | null) => speakerRole(label, mine, attributions)
      // Every name the app knows, and the speakers' own labels, become placeholders (FR-007).
      const labels = [...new Set(text.turns.map((t) => t.speaker).filter((s) => s !== null))]
      const names = [
        ...known,
        ...mine.map((p) => p.name),
        ...labels.filter((l) => !isGenericLabel(l)),
      ]
      const chunks = makeChunks(text.turns)
      set(sessionId, { state: 'verbatims', chunks: chunks.length, chunksDone: 0 })
      await save()
      const found: FoundVerbatim[] = []
      let failure: FactsFailure | null = null
      const queue = [...chunks]
      const worker = async () => {
        for (let chunk = queue.shift(); chunk && !failure; chunk = queue.shift()) {
          if (providerGone || (await halted(sessionId))) return
          const turns = chunk.turns.map((t) => sendTurn(t, names))
          let answer: Awaited<ReturnType<EvidenceDeps['ai']['verbatims']>> | null = null
          for (let attempt = 1; attempt <= ATTEMPTS && !answer; attempt++) {
            try {
              answer = await deps.ai.verbatims(by, factsRef(job.runId, sessionId), {
                goal: withPlaceholders(context.goal, names).text,
                themes: context.themes.map((t) => withPlaceholders(t.title, names).text),
                turns: turns.map((t) => ({
                  id: t.id,
                  role: roleOf(t.speaker).role,
                  speaker: speakerSent(roleOf(t.speaker)),
                  text: t.sent,
                  context: t.context,
                })),
              })
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
          const checked = checkVerbatims(turns, answer, (s) => roleOf(s).role)
          found.push(...checked.kept)
          const progress = run?.sessions.find((s) => s.sessionId === sessionId)
          set(sessionId, { chunksDone: (progress?.chunksDone ?? 0) + 1 })
          if (run)
            run = {
              ...run,
              leftOut: { ...run.leftOut, verbatims: run.leftOut.verbatims + checked.leftOut },
            }
          await save()
        }
      }
      await Promise.all(Array.from({ length: CHUNKS_PARALLEL }, worker))
      if (failure) return failure
      if (providerGone) return 'AI_PROVIDER_REQUIRED'
      const haltedNow = await halted(sessionId)
      if (haltedNow) return haltedNow

      // Overlapping parts may give a verbatim twice: the longer stays.
      const unique: FoundVerbatim[] = []
      for (const f of [...found].sort((a, b) => b.length - a.length))
        if (
          !unique.some(
            (u) =>
              u.segmentId === f.segmentId &&
              u.offset < f.offset + f.length &&
              f.offset < u.offset + u.length,
          )
        )
          unique.push(f)
      const order = new Map(text.turns.map((t, i) => [t.id, i]))
      const byPlace = (
        a: { segmentId: string; offset: number },
        b: { segmentId: string; offset: number },
      ) => (order.get(a.segmentId) ?? 0) - (order.get(b.segmentId) ?? 0) || a.offset - b.offset
      unique.sort(byPlace)
      const existing = await deps.store.verbatimsOf(sessionId)
      const merged = mergeVerbatims(existing, unique)
      const at = now()
      const added: StoredVerbatim[] = merged.added.map((f) => ({
        id: newId(),
        sessionId,
        studyId,
        segmentId: f.segmentId,
        offset: f.offset,
        length: f.length,
        text: f.text,
        speaker: f.speaker,
        participant: roleOf(f.speaker).participant,
        reason: f.reason,
        origin: 'ai',
        runId: job.runId,
        setAside: false,
        createdBy: by,
        createdAt: at,
      }))
      const facts = await deps.store.factsOf(sessionId)
      const decided = facts.filter((f) => f.status !== 'proposed')
      const usedByDecided = new Set(decided.flatMap((f) => f.verbatimIds))
      // The fact pass groups what this reading found and a person's unused verbatims (R7).
      const pool = [
        ...existing.filter(
          (v) =>
            !v.setAside &&
            !usedByDecided.has(v.id) &&
            (merged.reused.includes(v.id) || v.origin === 'person'),
        ),
        ...added,
      ].sort(byPlace)
      set(sessionId, { state: 'facts' })
      await save()
      const proposed: Fact[] = []
      // An existing fact is taken up once per reading, whatever the batch (review of PR #14).
      const takenIds = new Set<string>()
      for (let i = 0; i < pool.length; i += FACT_BATCH) {
        const haltedNow = await halted(sessionId)
        if (haltedNow) return haltedNow
        const batch = pool.slice(i, i + FACT_BATCH)
        const ids = new Map(batch.map((v, k) => [`v${k + 1}`, v.id]))
        // The facts already there, so a new reading takes them up rather than writing them again.
        const refOfVerbatim = new Map([...ids].map(([ref, id]) => [id, ref]))
        const known = facts.filter((f) => f.status !== 'rejected')
        const factRefs = new Map(known.map((f, k) => [`F${k + 1}`, f]))
        let answer: Awaited<ReturnType<EvidenceDeps['ai']['facts']>> | null = null
        for (let attempt = 1; attempt <= ATTEMPTS && !answer; attempt++) {
          try {
            answer = await deps.ai.facts(by, factsRef(job.runId, sessionId), {
              goal: withPlaceholders(context.goal, names).text,
              themes: [...themeIds].map(([id, t]) => ({
                id,
                title: t ? withPlaceholders(t.title, names).text : 'Other',
              })),
              existing: [...factRefs].map(([ref, f]) => ({
                ref,
                statement: withPlaceholders(f.statement.en, names).text,
                polarity: f.polarity,
                theme: [...themeIds].find(([, t]) => t?.id === f.theme?.id)?.[0] ?? 'other',
                status: f.status === 'proposed' ? ('to decide' as const) : ('decided' as const),
                verbatims: f.verbatimIds.flatMap((id) => refOfVerbatim.get(id) ?? []),
              })),
              verbatims: batch.map((v, k) => ({
                id: `v${k + 1}`,
                speaker: v.participant ?? 'unknown speaker',
                text: withPlaceholders(v.text, names).text,
              })),
            })
          } catch (error) {
            if (error instanceof AiUnavailable) {
              providerGone = true
              return 'AI_PROVIDER_REQUIRED'
            }
            if (attempt >= ATTEMPTS)
              return error instanceof AiFailed && error.invalid ? 'INVALID_ANSWER' : 'AI_FAILED'
          }
        }
        if (!answer) return 'AI_FAILED'
        const checked = checkFacts(answer, ids, themeIds, names)
        let leftOut = checked.leftOut
        for (const c of checked.kept) {
          const taken = c.ref ? factRefs.get(c.ref) : undefined
          // A decided fact is never changed by a reading (FR-010).
          if (taken && taken.status !== 'proposed') continue
          if (isReproposal(c, decided) || isRepeated(c, proposed)) {
            leftOut++
            continue
          }
          if (taken) {
            if (takenIds.has(taken.id)) {
              leftOut++
              continue
            }
            takenIds.add(taken.id)
            // Taken up: the same fact, at the same place in the list, with the new reading's words.
            proposed.push({
              ...taken,
              statement: c.statement,
              translation: 'done',
              polarity: c.polarity,
              theme: c.theme,
              verbatimIds: c.verbatimIds,
              runId: job.runId,
              version: taken.version + 1,
            })
            continue
          }
          proposed.push({
            id: newId(),
            sessionId,
            studyId,
            statement: c.statement,
            translation: 'done',
            polarity: c.polarity,
            theme: c.theme,
            verbatimIds: c.verbatimIds,
            origin: 'ai',
            status: 'proposed',
            runId: job.runId,
            decidedBy: null,
            decidedAt: null,
            version: 1,
          })
        }
        if (run) run = { ...run, leftOut: { ...run.leftOut, facts: run.leftOut.facts + leftOut } }
      }
      // Saved done first: from then on a take-out is refused, and one that came before is seen here;
      // an interview stopped during its last call keeps what it had before this reading.
      set(sessionId, { state: 'done' })
      await save()
      const haltedBeforeSave = await halted(sessionId)
      if (haltedBeforeSave) return haltedBeforeSave
      const cited = new Set(proposed.flatMap((f) => f.verbatimIds))
      await deps.store.replaceReading({
        sessionId,
        keep: [...merged.reused, ...existing.filter((v) => cited.has(v.id)).map((v) => v.id)],
        verbatims: added,
        facts: proposed,
        reading: {
          sessionId,
          studyId,
          runId: job.runId,
          readAt: now(),
          rawImportedAt: text.rawImportedAt,
          textAnalysed: access.textAnalysed,
          anonymised: access.anonymised,
          fingerprint: text.fingerprint,
        },
      })
      return null
    }

    const queue = pending.filter((id) => !failedImports.has(id))
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (providerGone) {
          set(id, { state: 'failed', failure: 'AI_PROVIDER_REQUIRED' })
          continue
        }
        const haltedNow = await halted(id)
        if (haltedNow) {
          set(id, { state: 'failed', failure: haltedNow })
          continue
        }
        let failure: FactsFailure | null
        try {
          failure = await readOne(id)
        } catch (error) {
          deps.log.warn({ error: String(error), sessionId: id }, 'facts reading failed')
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

  return { estimate, giveConsent, start, stop, stopSession, runJob, liveRun }
}

export type AnalysisCommands = ReturnType<typeof makeAnalysisCommands>
