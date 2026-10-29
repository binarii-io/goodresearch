import {
  err,
  fold,
  makeChunks,
  newId,
  ok,
  type Result,
  withPlaceholders,
} from '@goodresearch/shared'
import { cleanDocName, renderCleanDoc } from '../../domain/clean-doc.ts'
import { checkCorrections, prepareChunk } from '../../domain/correction-check.ts'
import {
  type CleaningFailure,
  type CleaningProgress,
  type CorrectionRun,
  cleaningRef,
  interruptedCleaning,
  isCleaningLive,
} from '../../domain/correction-run.ts'
import {
  applyCorrections,
  type Correction,
  caseByCaseToDecide,
  effectiveCorrections,
  fingerprint,
  inherit,
  type Suggestion,
  toDecideOf,
} from '../../domain/corrections.ts'
import { fileChanged, type Transcript } from '../../domain/lexicon-run.ts'
import type { Segment } from '../../domain/segments.ts'
import { loadCorrections, personTerms } from '../cleaning-corrections.ts'
import {
  type Actor,
  AiFailed,
  AiUnavailable,
  type CleaningDeps,
  type CleaningJob,
  type CleaningRequest,
} from '../ports.ts'
import type { LexiconCommands } from './lexicon-commands.ts'

/** Interviews cleaned at once, and chunks of one interview at once (plan, Performance Goals). */
const INTERVIEWS_PARALLEL = 3
const CHUNKS_PARALLEL = 2
/** A chunk the provider fails on is asked once more (FR-015). */
const CHUNK_ATTEMPTS = 2
/** Output tokens counted per chunk in the estimate (research R6). */
export const CHUNK_ANSWER_TOKENS = 1_500
/** What a chunk sends besides its turns: the rules and the terms. */
const CHUNK_OVERHEAD_CHARS = 3_000
/** An interview not imported yet: about one hour of speech. */
const UNREAD_INTERVIEW_CHUNKS = 8
const UNREAD_CHUNK_CHARS = 20_000
export const REPLACEMENT_MAX = 200

type StudyError = 'STUDY_NOT_FOUND' | 'NOT_AN_INTERVIEW_STUDY' | 'FOLDER_ACCESS_REQUIRED'

export type StartCleaningError =
  | StudyError
  | 'NOTHING_TO_CLEAN'
  | 'AI_PROVIDER_REQUIRED'
  | 'CLEANING_CONSENT_REQUIRED'
  | 'ENRICHMENT_RUNNING'

export type CorrectionError =
  | StudyError
  | 'SESSION_NOT_FOUND'
  | 'CORRECTION_NOT_FOUND'
  | 'EDIT_NOT_ALLOWED'
  | 'REPLACEMENT_TOO_LONG'
  | 'REPLACEMENT_REQUIRED'
  | 'ORIGINAL_NOT_FOUND'
  | 'VERSION_CONFLICT'

export type PublishError =
  | StudyError
  | 'SESSION_NOT_FOUND'
  | 'NOT_CLEAN'
  | 'DRIVE_CHANGED'
  | 'NO_SOURCE_FOLDER'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_UNAVAILABLE'
  | 'DRIVE_WRITE_REQUIRED'
  | 'DRIVE_CANNOT_EDIT'

export type Decision = 'accept' | 'reject' | 'edit' | 'reopen'

const FOLDER_NAME = { en: 'Clean transcripts', fr: 'Transcriptions nettoyées' } as const

export const makeCleaningCommands = (deps: CleaningDeps, lexicon: LexiconCommands) => {
  const now = () => deps.clock.now()

  const actingOn = async (accountId: string, studyId: string) => {
    const access = await deps.studies.getStudyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
    const found = await deps.sources.enrichmentSessions(accountId, studyId)
    if (!found) return err('FOLDER_ACCESS_REQUIRED' as const)
    return ok({ ...access, sessions: found.sessions })
  }

  /** A validated interview of the study with its imported text. */
  const interviewOf = async (accountId: string, studyId: string, sessionId: string) => {
    const study = await actingOn(accountId, studyId)
    if (!study.ok) return study
    const session = study.value.sessions.find((s) => s.id === sessionId)
    const transcript = session ? await deps.store.getTranscript(sessionId) : null
    if (!session || !transcript || transcript.studyId !== studyId)
      return err('SESSION_NOT_FOUND' as const)
    return ok({ study: study.value, session, transcript })
  }

  const corrections = (
    accountId: string,
    study: { teamId: string; anonymised: boolean },
    studyId: string,
    transcript: Transcript,
    /** A run or a validation gives the missing codes; a decision only reads them. */
    assign = false,
  ) =>
    loadCorrections(deps, {
      accountId,
      studyId,
      teamId: study.teamId,
      anonymised: study.anonymised,
      transcript,
      assign,
    })

  /**
   * What "Clean transcripts" would clean: never cleaned, changed since, or all; with `only`, those
   * interviews whatever their state (one interview cleaned again).
   */
  const toClean = async (
    accountId: string,
    studyId: string,
    mode: 'lexicon' | 'ai',
    all: boolean,
    only?: readonly string[] | undefined,
  ) => {
    const study = await actingOn(accountId, studyId)
    if (!study.ok) return study
    const [imported, cleanings] = await Promise.all([
      deps.store.transcriptsOf(studyId),
      deps.cleaning.cleaningsOf(studyId),
    ])
    const byId = new Map(imported.map((t) => [t.sessionId, t]))
    const cleaned = new Map(cleanings.map((c) => [c.sessionId, c]))
    const sessions = study.value.sessions.filter((s) => {
      if (!s.transcript) return false
      if (only) return only.includes(s.id)
      if (all) return true
      const t = byId.get(s.id)
      const c = cleaned.get(s.id)
      return (
        !t ||
        !c ||
        fileChanged(s, t) ||
        t.importedAt.getTime() > c.cleanedAt.getTime() ||
        c.anonymised !== study.value.anonymised ||
        // With the AI: turns it has not read yet (a run that stopped or failed on some parts,
        // or cleaned with the lexicon only), review of PR #11.
        (mode === 'ai' && t.segments.some((x) => !c.aiReadSegments.includes(x.id)))
      )
    })
    return ok({ study: study.value, sessions, imported: byId, cleaned })
  }

  /** The chunks the AI would read of an interview: the unread turns, or all of them. */
  const chunksOf = (segments: readonly Segment[], read: readonly string[] | null, all: boolean) => {
    const known = new Set(read ?? [])
    const only =
      all || read === null
        ? undefined
        : new Set(segments.filter((s) => !known.has(s.id)).map((s) => s.id))
    if (only && only.size === 0) return []
    return makeChunks(segments, { only })
  }

  const estimate = async (
    accountId: string,
    studyId: string,
    mode: 'lexicon' | 'ai',
    all: boolean,
    sessionId?: string | undefined,
  ) => {
    const only = sessionId ? [sessionId] : undefined
    const again = all || !!only
    const found = await toClean(accountId, studyId, mode, again, only)
    if (!found.ok) return found
    const provider = await deps.ai.providerOf(accountId)
    let chunks = 0
    let chars = 0
    if (mode === 'ai')
      for (const s of found.value.sessions) {
        const t = found.value.imported.get(s.id)
        if (!t || fileChanged(s, t)) {
          chunks += UNREAD_INTERVIEW_CHUNKS
          chars += UNREAD_INTERVIEW_CHUNKS * UNREAD_CHUNK_CHARS
          continue
        }
        for (const c of chunksOf(
          t.segments,
          found.value.cleaned.get(s.id)?.aiReadSegments ?? null,
          again,
        )) {
          chunks++
          chars += CHUNK_OVERHEAD_CHARS + c.turns.reduce((n, x) => n + x.text.length, 0)
        }
      }
    return ok({
      interviews: found.value.sessions.length,
      chunks,
      cost:
        mode === 'lexicon' || chunks === 0
          ? 0
          : provider
            ? await deps.ai.estimate(accountId, chars, chunks * CHUNK_ANSWER_TOKENS, chunks)
            : null,
      consentNeeded:
        mode === 'ai' && provider
          ? !(await deps.store.hasConsent(accountId, studyId, provider, 'cleaning'))
          : false,
      aiConnected: provider !== null,
    })
  }

  /** A lexicon reading or a cleaning is live for the study (research R6). */
  const busy = async (studyId: string) => {
    if (await lexicon.liveRun(studyId)) return true
    const open = await deps.cleaning.openCleaningRun(studyId)
    if (!open) return false
    if (isCleaningLive(open, now())) return true
    await deps.cleaning.saveCleaningRun(interruptedCleaning(open, now()))
    return false
  }

  const startCleaning = async (
    actor: Actor,
    studyId: string,
    options: {
      mode: 'lexicon' | 'ai'
      all: boolean
      consent: boolean
      sessionIds?: readonly string[] | undefined
    },
  ): Promise<Result<{ runId: string }, StartCleaningError>> => {
    // Chosen interviews are cleaned again in full, like "Analyze again" in Fieldwork.
    const all = options.all || !!options.sessionIds
    const found = await toClean(actor.id, studyId, options.mode, all, options.sessionIds)
    if (!found.ok) return found
    if (found.value.sessions.length === 0) return err('NOTHING_TO_CLEAN')
    if (options.mode === 'ai') {
      const provider = await deps.ai.providerOf(actor.id)
      if (!provider) return err('AI_PROVIDER_REQUIRED')
      if (!(await deps.store.hasConsent(actor.id, studyId, provider, 'cleaning'))) {
        if (!options.consent) return err('CLEANING_CONSENT_REQUIRED')
        await deps.store.giveConsent(actor.id, studyId, provider, now(), 'cleaning')
      }
    }
    if (await busy(studyId)) return err('ENRICHMENT_RUNNING')
    const at = now()
    const run: CorrectionRun = {
      id: newId(),
      studyId,
      teamId: found.value.study.teamId,
      startedBy: actor.id,
      mode: options.mode,
      sessions: found.value.sessions.map((s) => ({
        sessionId: s.id,
        state: 'waiting',
        chunks: 0,
        chunksDone: 0,
      })),
      stopRequested: false,
      leftOut: 0,
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.cleaning.createCleaningRun(run))) return err('ENRICHMENT_RUNNING')
    if (!(await deps.enqueueCleaning({ runId: run.id, studyId, all }))) {
      await deps.cleaning.saveCleaningRun(interruptedCleaning(run, now()))
      return err('ENRICHMENT_RUNNING')
    }
    return ok({ runId: run.id })
  }

  const stopCleaning = async (
    actor: Actor,
    studyId: string,
    runId: string,
  ): Promise<Result<void, StudyError | 'NOT_FOUND'>> => {
    const study = await actingOn(actor.id, studyId)
    if (!study.ok) return study
    const run = await deps.cleaning.getCleaningRun(runId)
    if (!run || run.studyId !== studyId) return err('NOT_FOUND')
    if (run.finishedAt === null) await deps.cleaning.requestCleaningStop(runId)
    return ok(undefined)
  }

  /** The worker side of a cleaning (research R4): import, then for each interview its chunks. */
  const runCleaningJob = async (job: CleaningJob): Promise<void> => {
    let run = await deps.cleaning.getCleaningRun(job.runId)
    if (!run || run.finishedAt !== null || run.studyId !== job.studyId) return
    const save = async () => {
      if (!run) return
      run = { ...run, heartbeatAt: now() }
      await deps.cleaning.saveCleaningRun(run)
    }
    const set = (sessionId: string, change: Partial<Omit<CleaningProgress, 'sessionId'>>) => {
      if (!run) return
      run = {
        ...run,
        sessions: run.sessions.map((s) => (s.sessionId === sessionId ? { ...s, ...change } : s)),
      }
    }
    let halted = false
    const stopped = async () => {
      if (halted) return true
      if (!(await deps.cleaning.cleaningStopRequested(job.runId))) return false
      halted = true
      if (run) {
        run = interruptedCleaning(run, now())
        await deps.cleaning.saveCleaningRun(run)
      }
      return true
    }

    const by = { startedBy: run.startedBy, studyId: run.studyId }
    const access = await deps.studies.getStudyAccess(run.startedBy, run.studyId)
    const found = await deps.sources.enrichmentSessions(run.startedBy, run.studyId)
    if (!access || !found) {
      for (const s of run.sessions) set(s.sessionId, { state: 'failed', failure: 'FILE_NOT_FOUND' })
      run = { ...run, finishedAt: now() }
      await deps.cleaning.saveCleaningRun(run)
      return
    }
    const sessions = new Map(found.sessions.map((s) => [s.id, s]))
    // The run gives the missing pseudonyms and interviewer codes; the views only read them.
    if (access.anonymised) await deps.cleaningNames(run.startedBy, run.studyId, { assign: true })
    const mode = run.mode
    let providerGone = false

    const cleanOne = async (sessionId: string): Promise<CleaningFailure | null> => {
      const session = sessions.get(sessionId)
      if (!session) return 'FILE_NOT_FOUND'
      const imported = await lexicon.importTranscript(by, session)
      if (!imported.transcript) return imported.failure ?? 'FILE_NOT_FOUND'
      const t = imported.transcript
      const at = now()
      const base = {
        studyId: by.studyId,
        sessionId,
        runId: job.runId,
        anonymised: access.anonymised,
        at,
      }
      if (mode === 'lexicon') {
        await deps.cleaning.markCleaned(base)
        return null
      }
      const row = (await deps.cleaning.cleaningsOf(by.studyId)).find(
        (c) => c.sessionId === sessionId,
      )
      const { all, terms, people } = await corrections(by.startedBy, access, by.studyId, t)
      // The AI reads the text with the corrections that apply already made (research R4).
      const applied = applyCorrections(t.segments, effectiveCorrections(all))
      const chunks = chunksOf(applied.segments, row?.aiReadSegments ?? null, job.all)
      set(sessionId, { chunks: chunks.length })
      await save()
      if (chunks.length === 0) {
        await deps.cleaning.markCleaned(base)
        return null
      }
      const verdicts = (await deps.store.verdictsOf(by.studyId)).filter(
        (v) => v.sessionId === sessionId,
      )
      const places = caseByCaseToDecide(
        { sessionId, language: t.language, segments: t.segments },
        terms,
        verdicts,
      )
      // FR-007: every name the app knows is replaced, anonymisation on or off.
      const names = [
        ...new Set([
          ...(await deps.sources.knownNames(by.startedBy, by.studyId)),
          ...people.map((p) => p.name),
          ...t.segments.flatMap((s) => (s.speaker ? [s.speaker] : [])),
          ...personTerms(terms).flatMap((x) => [x.form, ...x.variants.map((v) => v.spelling)]),
        ]),
      ]
      const hide = (text: string) => withPlaceholders(text, names).text
      const speakers = [...new Set(applied.segments.flatMap((s) => (s.speaker ? [s.speaker] : [])))]
      const accepted = terms.filter(
        (x) =>
          (x.status === 'accepted' || x.status === 'edited') &&
          x.category !== 'person' &&
          x.language === t.language,
      )
      const raw = new Map(t.segments.map((s) => [s.id, s]))
      const found: Correction[] = []
      const suggestions: Suggestion[] = []
      const read: string[] = []
      let failure: CleaningFailure | null = null
      const queue = [...chunks]
      const worker = async () => {
        for (let chunk = queue.shift(); chunk && !failure; chunk = queue.shift()) {
          if (providerGone || (await stopped())) return
          const sent = prepareChunk(chunk, names, places, applied.maps)
          const text = fold(chunk.turns.map((x) => x.text).join('\n'))
          const request: CleaningRequest = {
            chunk: sent,
            terms: accepted
              .filter((x) =>
                [x.form, ...x.variants.map((v) => v.spelling)].some((s) => text.includes(fold(s))),
              )
              // FR-007: a known name inside a term or its definition is replaced too.
              .map((x) => ({
                form: hide(x.kind === 'suspect' ? (x.correction ?? x.form) : x.form),
                variants: x.variants
                  .filter((v) => v.status === 'accepted')
                  .map((v) => hide(v.spelling)),
                definition: x.definition === null ? null : hide(x.definition),
                scope: x.scope,
              })),
            speakers: speakers.map((s) => withPlaceholders(s, names).text),
            anonymised: access.anonymised,
          }
          let answer: Awaited<ReturnType<CleaningDeps['cleaningAi']['correct']>> | null = null
          for (let attempt = 1; attempt <= CHUNK_ATTEMPTS && !answer; attempt++) {
            try {
              answer = await deps.cleaningAi.correct(
                by.startedBy,
                cleaningRef(job.runId, sessionId),
                request,
              )
            } catch (error) {
              if (error instanceof AiUnavailable) {
                providerGone = true
                failure = 'AI_PROVIDER_REQUIRED'
                return
              }
              if (attempt >= CHUNK_ATTEMPTS)
                failure =
                  error instanceof AiFailed && error.invalid ? 'INVALID_ANSWER' : 'AI_FAILED'
            }
          }
          if (!answer) return
          const checked = checkCorrections(
            {
              sessionId,
              chunk: sent,
              raw,
              maps: applied.maps,
              speakers,
              knownNames: names,
              anonymised: access.anonymised,
              neutral: t.language === 'fr' ? '[Personne]' : '[Person]',
              newId,
            },
            answer,
          )
          found.push(...checked.corrections)
          suggestions.push(...checked.suggestions)
          read.push(...chunk.turns.filter((x) => !x.context).map((x) => x.segmentId))
          const progress = run?.sessions.find((s) => s.sessionId === sessionId)
          set(sessionId, { chunksDone: (progress?.chunksDone ?? 0) + 1 })
          if (run) run = { ...run, leftOut: run.leftOut + checked.leftOut }
          await save()
        }
      }
      await Promise.all(Array.from({ length: CHUNKS_PARALLEL }, worker))
      // The provider went away while another interview was read: these chunks were not.
      if (providerGone && !failure) failure = 'AI_PROVIDER_REQUIRED'
      // What the chunks read is kept even when others failed: those turns are not read again.
      if (read.length > 0) {
        const decided = (await deps.cleaning.storedCorrections(sessionId)).filter(
          (c) => c.status !== 'proposed',
        )
        // The same correction found twice (overlapping parts) is kept once.
        const unique = new Map<string, Correction>()
        for (const c of inherit(found, decided))
          unique.set(`${c.segmentId}|${c.target}|${c.offset}|${c.original}|${c.replacement}`, c)
        await deps.cleaning.replaceFindings({
          ...base,
          readSegments: [...new Set(read)],
          corrections: [...unique.values()],
          suggestions,
        })
      }
      return failure
    }

    // A job delivered again (a worker that died) takes back the interview it was cleaning too.
    const queue = run.sessions
      .filter((s) => s.state === 'waiting' || s.state === 'cleaning')
      .map((s) => s.sessionId)
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        if (await stopped()) return
        set(id, { state: 'cleaning' })
        await save()
        let failure: CleaningFailure | null
        try {
          failure = await cleanOne(id)
        } catch (error) {
          deps.log.warn(
            { runId: job.runId, err: error instanceof Error ? error.message : 'unknown' },
            'interview not cleaned',
          )
          failure = 'AI_FAILED'
        }
        if (halted) return
        set(id, failure ? { state: 'failed', failure } : { state: 'done' })
        if (failure && run && !run.failure && failure.startsWith('AI_')) run = { ...run, failure }
        await save()
      }
    }
    await Promise.all(Array.from({ length: INTERVIEWS_PARALLEL }, worker))
    if (halted || !run) return
    run = { ...run, finishedAt: now() }
    await deps.cleaning.saveCleaningRun(run)
  }

  /** One correction of an interview by its key, among those that exist now. */
  const correctionOf = async (actor: Actor, studyId: string, sessionId: string, key: string) => {
    const found = await interviewOf(actor.id, studyId, sessionId)
    if (!found.ok) return found
    const { all } = await corrections(actor.id, found.value.study, studyId, found.value.transcript)
    const c = all.find((x) => x.key === key)
    if (!c) return err('CORRECTION_NOT_FOUND' as const)
    return ok({ ...found.value, correction: c })
  }

  /** One decision on a correction read already (a person's, or each of "accept all shown"). */
  const decideOn = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    c: Correction,
    input: { decision: Decision; replacement?: string | undefined; version?: number | undefined },
  ): Promise<Result<void, CorrectionError>> => {
    const key = c.key
    const replacement = input.replacement?.trim()
    if (input.decision === 'edit') {
      if (!replacement) return err('REPLACEMENT_REQUIRED')
      if (Array.from(replacement).length > REPLACEMENT_MAX) return err('REPLACEMENT_TOO_LONG')
    }
    // FR-010: a lexicon correction is the verdict of its occurrence.
    if (c.source === 'lexicon' || c.source === 'ai-lexicon') {
      if (input.decision === 'edit') return err('EDIT_NOT_ALLOWED')
      if (!c.termId) return err('CORRECTION_NOT_FOUND')
      // The correction was computed from this occurrence just now: its place holds the term.
      await deps.store.saveVerdict(
        { termId: c.termId, studyId, sessionId, segmentId: c.segmentId, offset: c.offset },
        input.decision === 'reopen'
          ? null
          : {
              verdict: input.decision === 'accept' ? 'yes' : 'no',
              decidedBy: actor.id,
              decidedAt: now(),
            },
      )
      return ok(undefined)
    }
    if (c.source === 'name') {
      await deps.cleaning.saveDecision(
        sessionId,
        key,
        input.decision === 'reopen'
          ? null
          : {
              status:
                input.decision === 'accept'
                  ? 'accepted'
                  : input.decision === 'reject'
                    ? 'rejected'
                    : 'edited',
              edited: input.decision === 'edit' ? (replacement ?? null) : null,
              decidedBy: actor.id,
              decidedAt: now(),
            },
      )
      return ok(undefined)
    }
    const version = c.version ?? 1
    if (input.version !== undefined && input.version !== version) return err('VERSION_CONFLICT')
    const next: Correction = {
      ...c,
      status:
        input.decision === 'accept'
          ? 'accepted'
          : input.decision === 'reject'
            ? 'rejected'
            : input.decision === 'edit'
              ? 'edited'
              : 'proposed',
      edited:
        input.decision === 'edit'
          ? (replacement ?? null)
          : input.decision === 'reopen'
            ? null
            : c.edited,
      decidedBy: input.decision === 'reopen' ? null : actor.id,
      decidedAt: input.decision === 'reopen' ? null : now(),
      version: version + 1,
    }
    return (await deps.cleaning.saveCorrection(next, version)) === 'ok'
      ? ok(undefined)
      : err('VERSION_CONFLICT')
  }

  const decideCorrection = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    key: string,
    input: { decision: Decision; replacement?: string | undefined; version?: number | undefined },
  ): Promise<Result<void, CorrectionError>> => {
    const found = await correctionOf(actor, studyId, sessionId, key)
    if (!found.ok) return found
    return decideOn(actor, studyId, sessionId, found.value.correction, input)
  }

  const addCorrection = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    input: {
      segmentId: string
      target: 'text' | 'speaker'
      offset: number
      length: number
      original: string
      replacement: string
    },
  ): Promise<Result<{ key: string }, CorrectionError>> => {
    const found = await interviewOf(actor.id, studyId, sessionId)
    if (!found.ok) return found
    const segment = found.value.transcript.segments.find((s) => s.id === input.segmentId)
    const there =
      input.target === 'speaker'
        ? segment?.speaker === input.original
        : segment?.text.slice(input.offset, input.offset + input.length) === input.original &&
          input.original.length === input.length
    if (!segment || !there || input.original.length === 0) return err('ORIGINAL_NOT_FOUND')
    const replacement = input.replacement.trim()
    if (!replacement) return err('REPLACEMENT_REQUIRED')
    if (Array.from(replacement).length > REPLACEMENT_MAX) return err('REPLACEMENT_TOO_LONG')
    const at = now()
    const c: Correction = {
      key: newId(),
      sessionId,
      segmentId: input.segmentId,
      target: input.target,
      offset: input.target === 'speaker' ? 0 : input.offset,
      length: input.original.length,
      original: input.original,
      replacement,
      edited: null,
      kind: input.target === 'speaker' ? 'speaker' : 'transcription',
      source: 'person',
      reason: null,
      confidence: null,
      termId: null,
      status: 'accepted',
      decidedBy: actor.id,
      decidedAt: at,
      version: 1,
    }
    if ((await deps.cleaning.insertCorrection(c, studyId, null, at)) === 'ok')
      return ok({ key: c.key })
    // The same correction is stored already (one the AI proposed): it becomes this person's.
    const same = (await deps.cleaning.storedCorrections(sessionId)).find(
      (x) =>
        x.segmentId === c.segmentId &&
        x.target === c.target &&
        x.offset === c.offset &&
        x.original === c.original &&
        x.replacement === c.replacement,
    )
    if (!same) return err('VERSION_CONFLICT')
    const decided = await decideOn(actor, studyId, sessionId, same, { decision: 'accept' })
    return decided.ok ? ok({ key: same.key }) : decided
  }

  /** "Accept all shown": each with its own state; the others changed meanwhile. */
  const decideMany = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    keys: readonly string[],
    decision: 'accept' | 'reject',
  ): Promise<Result<{ decided: number }, StudyError | 'SESSION_NOT_FOUND'>> => {
    const found = await interviewOf(actor.id, studyId, sessionId)
    if (!found.ok) return found
    // Read once, then each key decided against that one set (review of PR #11).
    const { all } = await corrections(actor.id, found.value.study, studyId, found.value.transcript)
    const byKey = new Map(all.map((c) => [c.key, c]))
    let decided = 0
    for (const key of keys) {
      const c = byKey.get(key)
      if (c && (await decideOn(actor, studyId, sessionId, c, { decision })).ok) decided++
    }
    return ok({ decided })
  }

  const validateClean = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    seen: string,
  ): Promise<
    Result<
      { number: number },
      StudyError | 'SESSION_NOT_FOUND' | 'CORRECTIONS_TO_DECIDE' | 'VERSION_CONFLICT'
    >
  > => {
    const found = await interviewOf(actor.id, studyId, sessionId)
    if (!found.ok) return found
    const { transcript, study } = found.value
    const { all } = await corrections(actor.id, study, studyId, transcript)
    if (toDecideOf(all).length > 0) return err('CORRECTIONS_TO_DECIDE')
    const effective = effectiveCorrections(all)
    const print = fingerprint(effective)
    if (print !== seen) return err('VERSION_CONFLICT')
    const number = await deps.cleaning.addVersion({
      sessionId,
      segments: applyCorrections(transcript.segments, effective).segments,
      rawImportedAt: transcript.importedAt,
      anonymised: study.anonymised,
      fingerprint: print,
      createdBy: actor.id,
      createdAt: now(),
    })
    return ok({ number })
  }

  const publishClean = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    input: { overwrite: boolean; language: 'en' | 'fr' },
  ): Promise<Result<{ webLink: string; versionNumber: number }, PublishError>> => {
    const found = await interviewOf(actor.id, studyId, sessionId)
    if (!found.ok) return found
    const latest = await deps.cleaning.latestVersion(sessionId)
    if (!latest) return err('NOT_CLEAN')
    const files = await deps.cleanFiles(actor.id, studyId)
    if (!files.ok) return err(files.error === 'STUDY_NOT_FOUND' ? 'STUDY_NOT_FOUND' : files.error)
    const fail = (e: 'DRIVE_NOT_CONNECTED' | 'DRIVE_CANNOT_EDIT' | 'DRIVE_CHANGED_MEANWHILE') =>
      err(e === 'DRIVE_CHANGED_MEANWHILE' ? ('DRIVE_CHANGED' as const) : e)
    const kept = await deps.cleaning.folderOf(studyId)
    const name = kept?.name ?? FOLDER_NAME[input.language]
    const folder = await files.value.ensureFolder(name, kept?.folderId ?? null)
    if (!folder.ok) return fail(folder.error)
    if (folder.value.id !== kept?.folderId)
      await deps.cleaning.saveFolder(studyId, folder.value.id, name)
    const language = found.value.transcript.language === 'fr' ? 'fr' : 'en'
    const doc = renderCleanDoc(found.value.session.title, language, latest.segments)
    const fileName = cleanDocName(found.value.session.title, language)
    const previous = await deps.cleaning.publicationOf(sessionId)
    const publish = async (fileId: string, webLink: string) => {
      const revision = await files.value.revision(fileId)
      await deps.cleaning.savePublication({
        sessionId,
        fileId,
        fileName,
        webLink,
        versionNumber: latest.number,
        revision: revision.ok ? revision.value : null,
        publishedBy: actor.id,
        publishedAt: now(),
      })
      return ok({ webLink, versionNumber: latest.number })
    }
    if (previous) {
      const meta = await files.value.metadata(previous.fileId)
      if (!meta.ok) return fail(meta.error)
      const usable =
        meta.value && !meta.value.trashed && meta.value.parents.includes(folder.value.id)
      if (usable) {
        const revision = await files.value.revision(previous.fileId)
        if (!revision.ok) return fail(revision.error)
        if (revision.value !== null) {
          // An unknown revision counts as changed: Drive edits are never lost silently.
          if (revision.value !== previous.revision && !input.overwrite) return err('DRIVE_CHANGED')
          const written = await files.value.rewriteDocument(previous.fileId, doc, revision.value)
          if (!written.ok) return fail(written.error)
          return publish(previous.fileId, meta.value?.webViewLink ?? previous.webLink)
        }
      }
    }
    const created = await files.value.createDocument(folder.value.id, fileName, doc)
    if (!created.ok) return fail(created.error)
    return publish(created.value.id, created.value.webViewLink)
  }

  return {
    estimate,
    startCleaning,
    stopCleaning,
    runCleaningJob,
    decideCorrection,
    addCorrection,
    decideMany,
    validateClean,
    publishClean,
    busy,
  }
}

export type CleaningCommands = ReturnType<typeof makeCleaningCommands>
