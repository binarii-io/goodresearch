import {
  err,
  fold,
  fromPlaceholders,
  languageOf,
  newId,
  ok,
  type Result,
  withPlaceholders,
} from '@goodresearch/shared'
import { type CheckedTerm, checkAnswer } from '../../domain/answer-check.ts'
import {
  CANDIDATE_LIMIT,
  type Candidate,
  findCandidates,
  type Interview,
  type TermLanguage,
} from '../../domain/candidates.ts'
import {
  BATCH_SIZE,
  EXCERPT_MAX,
  EXCERPTS_PER_CANDIDATE,
  makeBatches,
} from '../../domain/excerpts.ts'
import {
  fileChanged,
  interrupted,
  isLive,
  type LexiconFailure,
  type LexiconRun,
  needsReading,
  type Reading,
  runRef,
  type Transcript,
} from '../../domain/lexicon-run.ts'
import {
  absorb,
  decideTerm,
  type LexiconTerm,
  mergeTerms,
  proposeTerm,
  spellingsOf,
  type TermDecision,
} from '../../domain/lexicon-term.ts'
import { countOccurrences, occurrenceAt } from '../../domain/occurrences.ts'
import { keepIds, parseSegments, type Segment } from '../../domain/segments.ts'
import {
  type Actor,
  AiFailed,
  AiUnavailable,
  type SourceSession,
  type TranscriptsDeps,
} from '../ports.ts'

/** Interviews imported at once (research R8). */
const IMPORT_PARALLEL = 3
/** Output tokens counted per AI call in the estimate: a usual answer, not the ceiling (R8). */
export const ANSWER_TOKENS = 2_500
const WRITE_ATTEMPTS = 3

export type StartError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NOT_AN_INTERVIEW_STUDY'
  | 'NO_VALIDATED_INTERVIEW'
  | 'NOTHING_TO_READ'
  | 'AI_PROVIDER_REQUIRED'
  | 'LEXICON_CONSENT_REQUIRED'
  | 'LEXICON_RUNNING'
  | 'ENRICHMENT_RUNNING'

export type DecideError =
  | 'STUDY_NOT_FOUND'
  | 'NOT_AN_INTERVIEW_STUDY'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'TERM_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'TERM_EXISTS'
  | 'CORRECTION_REQUIRED'
  | 'MERGE_ITSELF'
  | 'LANGUAGE_DIFFERS'
  | 'INVALID_TRANSITION'

const interviewsOf = (transcripts: readonly Transcript[]): Interview[] =>
  transcripts.map((t) => ({ sessionId: t.sessionId, language: t.language, segments: t.segments }))

export const makeLexiconCommands = (deps: TranscriptsDeps) => {
  const now = () => deps.clock.now()

  const studyOf = async (accountId: string, studyId: string) => {
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
    return ok(access)
  }

  /** Acting on a study's lexicon needs what seeing it needs: the team and the folder (FR-017). */
  const actingOn = async (accountId: string, studyId: string) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    if (!(await deps.sources.enrichmentSessions(accountId, studyId)))
      return err('FOLDER_ACCESS_REQUIRED' as const)
    return study
  }

  /** What "Find terms" would read: never read, changed, or every one with `all`. */
  const toRead = async (accountId: string, studyId: string, all: boolean) => {
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    if (!found) return null
    const imported = new Map((await deps.store.transcriptsOf(studyId)).map((t) => [t.sessionId, t]))
    const withTranscript = found.sessions.filter((s) => s.transcript !== null)
    return {
      validated: found.sessions.length,
      sessions: withTranscript.filter((s) => all || needsReading(s, imported.get(s.id))),
    }
  }

  /** The most a reading can cost: every candidate it may send (research R8). */
  const estimatedCost = (accountId: string) => {
    const calls = Math.ceil(CANDIDATE_LIMIT / BATCH_SIZE)
    return deps.ai.estimate(
      accountId,
      CANDIDATE_LIMIT * EXCERPTS_PER_CANDIDATE * EXCERPT_MAX,
      calls * ANSWER_TOKENS,
      calls,
    )
  }

  const estimate = async (accountId: string, studyId: string, all: boolean) => {
    const study = await studyOf(accountId, studyId)
    if (!study.ok) return study
    const reading = await toRead(accountId, studyId, all)
    if (!reading) return err('FOLDER_ACCESS_REQUIRED' as const)
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      interviews: reading.sessions.length,
      estimatedCost: reading.sessions.length && provider ? await estimatedCost(accountId) : 0,
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, studyId, provider))
        : false,
      aiConnected: provider !== null,
    })
  }

  const startRun = async (
    actor: Actor,
    studyId: string,
    options: { consent?: boolean | undefined; all?: boolean | undefined },
  ): Promise<Result<{ runId: string }, StartError>> => {
    const study = await studyOf(actor.id, studyId)
    if (!study.ok) return study
    const reading = await toRead(actor.id, studyId, options.all === true)
    if (!reading) return err('FOLDER_ACCESS_REQUIRED')
    if (reading.validated === 0) return err('NO_VALIDATED_INTERVIEW')
    if (reading.sessions.length === 0) return err('NOTHING_TO_READ')
    const provider = await deps.ai.providerOf(actor.id)
    if (!provider) return err('AI_PROVIDER_REQUIRED')
    if (!(await deps.store.hasConsent(actor.id, studyId, provider))) {
      if (!options.consent) return err('LEXICON_CONSENT_REQUIRED')
      await deps.store.giveConsent(actor.id, studyId, provider, now())
    }
    // One Enrichment run per study (spec 011 research R6): a live cleaning blocks a reading.
    if (await deps.otherRunLive?.(studyId)) return err('ENRICHMENT_RUNNING')
    const open = await deps.store.openRun(studyId)
    if (open) {
      if (isLive(open, now())) return err('LEXICON_RUNNING')
      // A run that died (worker stopped): its rows are interrupted, a new run may start.
      await deps.store.saveRun(interrupted(open, now()))
    }
    const at = now()
    const run: LexiconRun = {
      id: newId(),
      studyId,
      teamId: study.value.teamId,
      startedBy: actor.id,
      sessions: reading.sessions.map((s) => ({ sessionId: s.id, state: 'waiting' })),
      phase: 'import',
      stopRequested: false,
      leftOut: 0,
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.store.createRun(run))) return err('LEXICON_RUNNING')
    // The queue still holds a job of this study (a worker that died): this run would never start.
    if (!(await deps.enqueue({ runId: run.id, studyId }))) {
      await deps.store.saveRun(interrupted(run, now()))
      return err('LEXICON_RUNNING')
    }
    return ok({ runId: run.id })
  }

  const stopRun = async (
    actor: Actor,
    studyId: string,
    runId: string,
  ): Promise<
    Result<
      void,
      'STUDY_NOT_FOUND' | 'NOT_AN_INTERVIEW_STUDY' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_FOUND'
    >
  > => {
    const study = await actingOn(actor.id, studyId)
    if (!study.ok) return study
    const run = await deps.store.getRun(runId)
    if (!run || run.studyId !== studyId) return err('NOT_FOUND')
    if (run.finishedAt === null) await deps.store.requestStop(runId)
    return ok(undefined)
  }

  /**
   * The language of a transcript the person did not set: from its words, else (a short text) the
   * language most of the study's transcripts have.
   */
  const languageFor = async (studyId: string, text: string): Promise<TermLanguage> => {
    const found = languageOf(text)
    if (found !== 'other') return found
    const counts = new Map<TermLanguage, number>()
    for (const t of await deps.store.transcriptsOf(studyId))
      if (t.language !== 'other') counts.set(t.language, (counts.get(t.language) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'
  }

  /** Imports one session's transcript as its raw version, keeping the ids of unchanged turns. */
  const importOne = async (
    run: { readonly startedBy: string; readonly studyId: string },
    session: SourceSession,
  ): Promise<{ transcript: Transcript | null; failure: LexiconFailure | null }> => {
    const previous = await deps.store.getTranscript(session.id)
    // The same file: its text is there already (read again for the terms, not imported again).
    if (previous && !fileChanged(session, previous)) return { transcript: previous, failure: null }
    const read = await deps.sources.readTranscript(run.startedBy, run.studyId, session.id)
    if (!read.ok) return { transcript: null, failure: read.error }
    const segments = keepIds(previous?.segments ?? [], parseSegments(read.value.text), () =>
      newId(),
    )
    const transcript: Transcript = {
      sessionId: session.id,
      studyId: run.studyId,
      fileId: session.transcript?.fileId ?? '',
      fileModifiedAt: read.value.modifiedAt,
      language: session.language ?? (await languageFor(run.studyId, read.value.text)),
      segments,
      importedBy: run.startedBy,
      importedAt: now(),
      readAt: null,
    }
    await deps.store.saveTranscript(transcript)
    return { transcript, failure: null }
  }

  /** Writes one checked proposal into the team's lexicon, never over a person's decision (R7). */
  const writeProposal = async (
    run: LexiconRun,
    language: TermLanguage,
    proposal: CheckedTerm,
  ): Promise<void> => {
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      const terms = (await deps.store.teamTerms(run.teamId)).filter(
        (t) => t.language === language && t.status !== 'merged',
      )
      const keys = [proposal.form, proposal.existingForm, ...proposal.variants]
        .filter((k): k is string => k !== null)
        .map(fold)
      const existing =
        terms.find((t) => fold(t.form) === fold(proposal.existingForm ?? proposal.form)) ??
        terms.find((t) =>
          [t.form, ...t.variants.map((v) => v.spelling)].some((s) => keys.includes(fold(s))),
        )
      if (existing) {
        const next = absorb(existing, proposal, now())
        if (!next || (await deps.store.saveTerm(next, existing.version)) === 'ok') return
        continue
      }
      const term = proposeTerm(proposal, {
        id: newId(),
        teamId: run.teamId,
        language,
        now: now(),
      })
      if ((await deps.store.insertTerm(term)) === 'ok') return
    }
    deps.log.warn({ runId: run.id }, 'lexicon proposal not written: changed meanwhile')
  }

  /** Recounts the occurrences of the team's terms in every imported transcript of the study. */
  const recount = async (studyId: string, teamId: string, accountId: string) => {
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    // Without the list of validated interviews (Drive unavailable, no access), nothing is replaced.
    if (!found) return
    const validated = new Set(found.sessions.map((s) => s.id))
    const transcripts = (await deps.store.transcriptsOf(studyId)).filter((t) =>
      validated.has(t.sessionId),
    )
    const terms = await deps.store.teamTerms(teamId)
    await deps.store.replaceOccurrences(studyId, countOccurrences(interviewsOf(transcripts), terms))
  }

  /** The worker side of a run (research R8): import, candidates, AI batches, counting. */
  const runJob = async (job: { runId: string; studyId: string }): Promise<void> => {
    let run = await deps.store.getRun(job.runId)
    if (!run || run.finishedAt !== null || run.studyId !== job.studyId) return
    const save = async (next: LexiconRun) => {
      run = { ...next, heartbeatAt: now() }
      await deps.store.saveRun(run)
    }
    const stopped = async () => {
      if (!(await deps.store.stopRequested(job.runId))) return false
      if (run) {
        await save(interrupted(run, now()))
        // Terms already written stay visible: their occurrences are counted.
        await recount(run.studyId, run.teamId, run.startedBy)
      }
      return true
    }
    const set = (sessionId: string, reading: Omit<Reading, 'sessionId'>) => {
      if (!run) return
      run = {
        ...run,
        sessions: run.sessions.map((s) =>
          s.sessionId === sessionId ? { sessionId, ...reading } : s,
        ),
      }
    }

    // 1. Import, 3 at a time; a failure leaves the others going.
    const found = await deps.sources.enrichmentSessions(run.startedBy, run.studyId)
    const byId = new Map((found?.sessions ?? []).map((s) => [s.id, s]))
    const read: Transcript[] = []
    const queue = run.sessions.filter((s) => s.state === 'waiting').map((s) => s.sessionId)
    let halted = false
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined && !halted; id = queue.shift()) {
        if (await stopped()) {
          halted = true
          return
        }
        const session = byId.get(id)
        if (!session) {
          set(id, { state: 'failed', failure: 'FILE_NOT_FOUND' })
          continue
        }
        set(id, { state: 'reading' })
        if (run) await save(run)
        const { transcript, failure } = await importOne(run as LexiconRun, session)
        if (transcript) read.push(transcript)
        set(id, failure ? { state: 'failed', failure } : { state: 'done' })
        if (run) await save(run)
      }
    }
    await Promise.all(Array.from({ length: IMPORT_PARALLEL }, worker))
    if (halted || !run) return

    // 2. Candidates of the interviews read, by the app's rules only.
    await save({ ...run, phase: 'candidates' })
    const terms = await deps.store.teamTerms(run.teamId)
    // FR-006: every name the app knows is replaced before the AI — rosters, schedule, team, the
    // speakers of the transcripts, and the terms people marked as a person's name.
    const people = terms.filter(
      (t) => t.category === 'person' && t.status !== 'merged' && t.status !== 'rejected',
    )
    const names = [
      ...new Set([
        ...(await deps.sources.knownNames(run.startedBy, run.studyId)),
        ...read.flatMap((t) => t.segments.flatMap((s) => (s.speaker ? [s.speaker] : []))),
        ...people.flatMap((t) => [t.form, ...t.variants.map((v) => v.spelling)]),
      ]),
    ]
    const { candidates, leftOut } = findCandidates({
      interviews: interviewsOf(read),
      common: deps.common,
      knownNames: names,
      lexicon: terms.flatMap(spellingsOf),
    })
    const segments = new Map<string, Segment>(read.flatMap((t) => t.segments.map((s) => [s.id, s])))
    const acceptedForms = new Map(
      terms
        .filter(
          (t) => (t.status === 'accepted' || t.status === 'edited') && t.category !== 'person',
        )
        .map((t) => [t.id, t.form]),
    )
    // The same placeholders in every excerpt: the AI's quotes are mapped back with them.
    const placeholders = withPlaceholders('', names).names

    // 3. The AI, batch after batch, one language per batch.
    await save({ ...(run as LexiconRun), phase: 'ai', leftOut })
    const byLanguage = new Map<TermLanguage, Candidate[]>()
    for (const c of candidates)
      byLanguage.set(c.language, [...(byLanguage.get(c.language) ?? []), c])
    let failure: LexiconFailure | null = null
    for (const [language, group] of byLanguage) {
      if (failure === 'AI_PROVIDER_REQUIRED') break
      for (const batch of makeBatches({
        candidates: group,
        segments,
        knownNames: names,
        acceptedForms,
      })) {
        if (await stopped()) return
        try {
          const answer = await deps.ai.propose(run.startedBy, runRef(run.id), batch)
          for (const proposal of checkAnswer(batch, answer))
            await writeProposal(run, language, {
              ...proposal,
              quote: fromPlaceholders(proposal.quote, placeholders),
            })
        } catch (error) {
          if (error instanceof AiUnavailable) {
            failure = 'AI_PROVIDER_REQUIRED'
            break
          }
          failure = error instanceof AiFailed && error.invalid ? 'INVALID_ANSWER' : 'AI_FAILED'
        }
        await deps.store.heartbeat(run.id, now())
      }
    }

    // 4. Occurrences of the team's terms in the study, recounted by the app.
    await save({ ...(run as LexiconRun), phase: 'counting', failure })
    await recount(run.studyId, run.teamId, run.startedBy)
    // Read only when the whole reading went through: otherwise "Find terms" offers them again.
    if (!failure)
      await deps.store.markRead(
        read.map((t) => t.sessionId),
        now(),
      )
    await save({ ...(run as LexiconRun), phase: 'finished', finishedAt: now() })
  }

  /** The term, if it belongs to the study's team. */
  const termOf = async (actor: Actor, studyId: string, termId: string) => {
    const study = await actingOn(actor.id, studyId)
    if (!study.ok) return study
    const term = await deps.store.getTerm(termId)
    if (!term || term.teamId !== study.value.teamId || term.status === 'merged')
      return err('TERM_NOT_FOUND' as const)
    return ok({ term, teamId: study.value.teamId })
  }

  const formTaken = async (term: LexiconTerm) =>
    (await deps.store.teamTerms(term.teamId)).some(
      (t) =>
        t.id !== term.id &&
        t.language === term.language &&
        t.status !== 'merged' &&
        fold(t.form) === fold(term.form),
    )

  const decide = async (
    actor: Actor,
    studyId: string,
    termId: string,
    version: number,
    decision: TermDecision,
  ): Promise<Result<LexiconTerm, DecideError>> => {
    const found = await termOf(actor, studyId, termId)
    if (!found.ok) return found
    const { term } = found.value
    if (term.version !== version) return err('VERSION_CONFLICT')
    const next = decideTerm(term, decision, actor.id, now())
    if (!next.ok) return next
    if (fold(next.value.form) !== fold(term.form) && (await formTaken(next.value)))
      return err('TERM_EXISTS')
    const saved = await deps.store.saveTerm(next.value, version)
    if (saved === 'stale') return err('VERSION_CONFLICT')
    if (saved === 'exists') return err('TERM_EXISTS')
    // A new form or spelling is counted at once in this study.
    if (decision.decision === 'edit') await recount(studyId, term.teamId, actor.id)
    return ok(next.value)
  }

  const merge = async (
    actor: Actor,
    studyId: string,
    termId: string,
    version: number,
    into: { termId: string; version: number },
  ): Promise<Result<LexiconTerm, DecideError>> => {
    const from = await termOf(actor, studyId, termId)
    if (!from.ok) return from
    const target = await termOf(actor, studyId, into.termId)
    if (!target.ok) return target
    if (from.value.term.version !== version || target.value.term.version !== into.version)
      return err('VERSION_CONFLICT')
    const merged = mergeTerms(from.value.term, target.value.term, actor.id, now())
    if (!merged.ok) return merged
    const saved = await deps.store.saveMerge(
      merged.value.from,
      version,
      merged.value.into,
      into.version,
    )
    if (saved !== 'ok') return err('VERSION_CONFLICT')
    await recount(studyId, from.value.teamId, actor.id)
    return ok(merged.value.into)
  }

  /**
   * A person's yes / no on one occurrence of a term in its context (the prototype's verdicts), or
   * null to take it back. The place must hold one of the term's spellings in a validated interview.
   */
  const judge = async (
    actor: Actor,
    studyId: string,
    termId: string,
    place: { sessionId: string; segmentId: string; offset: number },
    verdict: 'yes' | 'no' | null,
  ): Promise<Result<void, DecideError | 'OCCURRENCE_NOT_FOUND'>> => {
    const found = await termOf(actor, studyId, termId)
    if (!found.ok) return found
    const validated = await deps.sources.enrichmentSessions(actor.id, studyId)
    if (!validated?.sessions.some((s) => s.id === place.sessionId))
      return err('OCCURRENCE_NOT_FOUND')
    const transcript = await deps.store.getTranscript(place.sessionId)
    const segment = transcript?.segments.find((s) => s.id === place.segmentId)
    if (!segment || !occurrenceAt(found.value.term, segment.text, place.offset))
      return err('OCCURRENCE_NOT_FOUND')
    await deps.store.saveVerdict(
      { termId, studyId, ...place },
      verdict ? { verdict, decidedBy: actor.id, decidedAt: now() } : null,
    )
    return ok(undefined)
  }

  /** "Accept all shown" (FR-010): each term with its own version; the others changed meanwhile. */
  const decideMany = async (
    actor: Actor,
    studyId: string,
    decision: 'accept' | 'reject',
    terms: readonly { termId: string; version: number }[],
  ): Promise<
    Result<
      { done: number; changed: number },
      'STUDY_NOT_FOUND' | 'NOT_AN_INTERVIEW_STUDY' | 'FOLDER_ACCESS_REQUIRED'
    >
  > => {
    const study = await actingOn(actor.id, studyId)
    if (!study.ok) return study
    let done = 0
    for (const t of terms) {
      const r = await decide(actor, studyId, t.termId, t.version, { decision })
      if (r.ok) done++
    }
    return ok({ done, changed: terms.length - done })
  }

  return {
    estimate,
    startRun,
    stopRun,
    runJob,
    decide,
    merge,
    decideMany,
    judge,
    recount,
    importTranscript: importOne,
    liveRun: async (studyId: string) => isLive(await deps.store.openRun(studyId), now()),
  }
}

export type LexiconCommands = ReturnType<typeof makeLexiconCommands>
