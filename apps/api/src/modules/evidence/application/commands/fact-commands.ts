import { err, holdsName, newId, ok, type Result, words } from '@goodresearch/shared'
import { translationRef } from '../../domain/analysis-run.ts'
import {
  attachVerbatim,
  createFact,
  decideFact,
  type Fact,
  type FactDecision,
  type FactError,
  type Polarity,
  STATEMENT_MAX,
  type Theme,
} from '../../domain/facts.ts'
import { INTERVIEWER, speakerRole } from '../../domain/speakers.ts'
import { VERBATIM_MAX_WORDS, VERBATIM_MIN_WORDS } from '../../domain/verbatims.ts'
import { type StudyError, studyOf } from '../interviews.ts'
import type { EvidenceDeps, StoredVerbatim, TranslateJob } from '../ports.ts'

export type FactCommandError =
  | StudyError
  | FactError
  | 'FACT_NOT_FOUND'
  | 'VERBATIM_NOT_FOUND'
  | 'SPEAKER_TO_ATTRIBUTE'
  | 'INTERVIEWER_TURN'
  | 'VERBATIM_LENGTH'

type Actor = { readonly id: string }

type GivenStatement = { readonly en?: string | undefined; readonly fr?: string | undefined }

export const makeFactCommands = (deps: EvidenceDeps) => {
  const now = () => deps.clock.now()

  const factOf = async (actor: Actor, studyId: string, factId: string) => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    const fact = await factIn(study.value, studyId, factId)
    if (!fact) return err('FACT_NOT_FOUND' as const)
    return ok({ ...study.value, fact })
  }

  /** A fact of an interview of the study the person can see. */
  const factIn = async (
    study: { sessions: readonly { id: string }[] },
    studyId: string,
    factId: string,
  ) => {
    const fact = await deps.store.getFact(factId)
    return fact && fact.studyId === studyId && study.sessions.some((s) => s.id === fact.sessionId)
      ? fact
      : null
  }

  /** The guide's theme of an id, or "Other"; the title it had when the fact took it stays. */
  const themeOf = async (
    actor: Actor,
    studyId: string,
    themeId: string | null | undefined,
    current: Theme,
  ): Promise<Theme | undefined> => {
    if (themeId === undefined) return undefined
    if (themeId === null) return null
    if (current?.id === themeId) return current
    const { themes } = await deps.sources.context(actor.id, studyId)
    const found = themes.find((t) => t.id === themeId)
    return found ? { id: found.id, title: found.title } : null
  }

  /**
   * The verbatims a fact cites: of its interview, not set aside, each with its participant. Ids a
   * person sends must all be there; a fact's own ids skip those set aside since (`kept`).
   */
  const citedOf = async (
    sessionId: string,
    ids: readonly string[],
    kept = false,
    verbatimsOf: (sessionId: string) => Promise<readonly StoredVerbatim[]> = deps.store.verbatimsOf,
  ) => {
    const all = await verbatimsOf(sessionId)
    const cited = ids.map((id) => all.find((v) => v.id === id && !v.setAside))
    if (kept) return ok(cited.filter((v): v is StoredVerbatim => v !== undefined))
    if (cited.some((v) => v === undefined)) return err('VERBATIM_NOT_FOUND' as const)
    return ok(cited as StoredVerbatim[])
  }

  /**
   * Research R9: the language a person just wrote is translated. A decision that writes no
   * statement queues nothing: a translation still waiting applies to the same words.
   */
  const translateLater = async (actor: Actor, fact: Fact, given: GivenStatement | undefined) => {
    if (fact.translation !== 'translating') return
    if ((given?.en === undefined) === (given?.fr === undefined)) return
    const from = given?.en !== undefined ? 'en' : 'fr'
    const job: TranslateJob = {
      factId: fact.id,
      version: fact.version,
      accountId: actor.id,
      from,
      text: fact.statement[from],
    }
    await deps.enqueueTranslation(job)
  }

  /** FR-009: accept, reject or edit a fact, with the version the person saw. */
  const decide = async (
    actor: Actor,
    studyId: string,
    factId: string,
    input: {
      decision: 'accept' | 'reject' | 'edit'
      version: number
      statement?: GivenStatement | undefined
      polarity?: Polarity | undefined
      themeId?: string | null | undefined
      verbatims?: readonly string[] | undefined
    },
  ): Promise<Result<Fact, FactCommandError>> => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    return decideIn(
      {
        sessions: study.value.sessions,
        names: () => deps.sources.knownNames(actor.id, studyId),
        verbatimsOf: deps.store.verbatimsOf,
      },
      actor,
      studyId,
      factId,
      input,
    )
  }

  /** What a decision reads of its study, loaded once for "accept all shown". */
  type DecisionContext = {
    sessions: readonly { id: string }[]
    names: () => Promise<readonly string[]>
    verbatimsOf: (sessionId: string) => Promise<readonly StoredVerbatim[]>
  }

  const decideIn = async (
    context: DecisionContext,
    actor: Actor,
    studyId: string,
    factId: string,
    input: Parameters<typeof decide>[3],
  ): Promise<Result<Fact, FactCommandError>> => {
    const fact = await factIn(context, studyId, factId)
    if (!fact) return err('FACT_NOT_FOUND')
    const cited = await citedOf(
      fact.sessionId,
      input.verbatims ?? fact.verbatimIds,
      input.verbatims === undefined,
      context.verbatimsOf,
    )
    if (!cited.ok) return cited
    // Its verbatims all set aside: a fact can still be rejected, not kept.
    if (input.decision !== 'reject' && cited.value.length === 0) return err('FACT_NEEDS_VERBATIM')
    // A fact counts only once its people are known (research R8).
    if (input.decision !== 'reject' && cited.value.some((v) => v.participant === null))
      return err('SPEAKER_TO_ATTRIBUTE')
    const decision: FactDecision = {
      decision: input.decision,
      version: input.version,
      statement: input.statement,
      polarity: input.polarity,
      theme: await themeOf(actor, studyId, input.themeId, fact.theme),
      verbatimIds: input.verbatims,
    }
    const names = await context.names()
    const decided = decideFact(fact, decision, actor.id, now(), names)
    if (!decided.ok) return decided
    if ((await deps.store.saveFact(decided.value, fact.version)) !== 'ok')
      return err('VERSION_CONFLICT')
    await translateLater(actor, decided.value, input.statement)
    return ok(decided.value)
  }

  /** FR-009: a fact a person writes from verbatims of one interview, accepted at once. */
  const create = async (
    actor: Actor,
    studyId: string,
    input: {
      sessionId: string
      statement: GivenStatement
      polarity: Polarity
      themeId: string | null
      verbatims: readonly string[]
    },
  ): Promise<Result<Fact, FactCommandError>> => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    if (!study.value.sessions.some((s) => s.id === input.sessionId)) return err('SESSION_NOT_FOUND')
    const cited = await citedOf(input.sessionId, input.verbatims)
    if (!cited.ok) return cited
    if (cited.value.some((v) => v.participant === null)) return err('SPEAKER_TO_ATTRIBUTE')
    const made = createFact({
      id: newId(),
      sessionId: input.sessionId,
      studyId,
      statement: input.statement,
      polarity: input.polarity,
      theme: (await themeOf(actor, studyId, input.themeId, null)) ?? null,
      verbatimIds: input.verbatims,
      by: actor.id,
      now: now(),
      names: await deps.sources.knownNames(actor.id, studyId),
    })
    if (!made.ok) return made
    await deps.store.saveFact(made.value, null)
    await translateLater(actor, made.value, input.statement)
    return ok(made.value)
  }

  /** "Accept all shown" (FR-009): each fact with its own version; the others changed meanwhile. */
  const acceptMany = async (
    actor: Actor,
    studyId: string,
    facts: readonly { id: string; version: number }[],
  ): Promise<Result<{ done: number; changed: number }, StudyError>> => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    // The study, its known names and each interview's verbatims are read once, not per fact.
    let names: Promise<readonly string[]> | null = null
    const verbatims = new Map<string, Promise<readonly StoredVerbatim[]>>()
    const context: DecisionContext = {
      sessions: study.value.sessions,
      names: () => {
        names ??= deps.sources.knownNames(actor.id, studyId)
        return names
      },
      verbatimsOf: (sessionId) => {
        const known = verbatims.get(sessionId) ?? deps.store.verbatimsOf(sessionId)
        verbatims.set(sessionId, known)
        return known
      },
    }
    let done = 0
    let changed = 0
    for (const f of facts) {
      const result = await decideIn(context, actor, studyId, f.id, {
        decision: 'accept',
        version: f.version,
      })
      if (result.ok) done++
      else changed++
    }
    return ok({ done, changed })
  }

  /** FR-009: a verbatim from text a person highlights in an interviewee's turn. */
  /** The words a person selected in an interviewee's turn of the analysed text, checked. */
  const selectedPlace = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    input: { segmentId: string; offset: number; length: number },
  ): Promise<
    Result<
      {
        turn: { id: string; speaker: string | null }
        slice: string
        role: ReturnType<typeof speakerRole>
      },
      FactCommandError
    >
  > => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    if (!study.value.sessions.some((s) => s.id === sessionId)) return err('SESSION_NOT_FOUND')
    const text = await deps.sources.analysedText(
      actor.id,
      studyId,
      sessionId,
      study.value.access.textAnalysed,
    )
    const turn = typeof text === 'string' ? null : text.turns.find((t) => t.id === input.segmentId)
    const slice = turn?.text.slice(input.offset, input.offset + input.length) ?? ''
    if (!turn || slice.trim().length === 0) return err('VERBATIM_NOT_FOUND')
    const count = words(slice).length
    if (count < VERBATIM_MIN_WORDS || count > VERBATIM_MAX_WORDS) return err('VERBATIM_LENGTH')
    const people = (await deps.sources.people(actor.id, studyId, { assign: false }))?.[sessionId]
    const role = speakerRole(turn.speaker, people ?? [], await deps.store.speakersOf(sessionId))
    if (role.role === 'interviewer') return err('INTERVIEWER_TURN')
    return ok({ turn, slice, role })
  }

  const addVerbatim = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    input: {
      segmentId: string
      offset: number
      length: number
      fact?: { id: string; version: number } | undefined
    },
  ): Promise<Result<StoredVerbatim, FactCommandError>> => {
    const place = await selectedPlace(actor, studyId, sessionId, input)
    if (!place.ok) return place
    const { turn, slice, role } = place.value
    const verbatim: StoredVerbatim = {
      id: newId(),
      sessionId,
      studyId,
      segmentId: turn.id,
      offset: input.offset,
      length: input.length,
      text: slice,
      speaker: turn.speaker,
      participant: role.participant,
      reason: null,
      origin: 'person',
      runId: null,
      setAside: false,
      createdBy: actor.id,
      createdAt: now(),
    }
    if (input.fact) {
      const found = await factOf(actor, studyId, input.fact.id)
      if (!found.ok) return found
      const { fact } = found.value
      if (fact.sessionId !== sessionId) return err('FACT_NOT_FOUND')
      // A fact that counts (accepted) needs its people known (research R8).
      if (fact.status !== 'proposed' && verbatim.participant === null)
        return err('SPEAKER_TO_ATTRIBUTE')
      const attached = attachVerbatim(fact, verbatim.id, input.fact.version)
      if (!attached.ok) return attached
      // One transaction: a fact changed meanwhile leaves no verbatim behind.
      if (
        (await deps.store.addVerbatim(verbatim, {
          fact: attached.value,
          expected: fact.version,
        })) !== 'ok'
      )
        return err('VERSION_CONFLICT')
      return ok(verbatim)
    }
    await deps.store.addVerbatim(verbatim)
    return ok(verbatim)
  }

  /**
   * A person narrows (or widens) a verbatim to the words they select in its turn: it keeps its id
   * and its facts, and becomes theirs (a new reading never removes it, R7).
   */
  const resizeVerbatim = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    verbatimId: string,
    input: { segmentId?: string | undefined; offset: number; length: number },
  ): Promise<Result<void, FactCommandError>> => {
    const v = (await deps.store.verbatimsOf(sessionId)).find((x) => x.id === verbatimId)
    if (!v || v.studyId !== studyId || v.setAside) return err('VERBATIM_NOT_FOUND')
    const segmentId = input.segmentId ?? v.segmentId
    const place = await selectedPlace(actor, studyId, sessionId, { ...input, segmentId })
    if (!place.ok) return place
    // Moved to another turn, it takes that turn's speaker.
    await deps.store.resizeVerbatim(verbatimId, {
      segmentId,
      offset: input.offset,
      length: input.length,
      text: place.value.slice,
      speaker: place.value.turn.speaker,
      participant: place.value.role.participant,
    })
    return ok(undefined)
  }

  /** FR-009: a verbatim set aside is no longer shown, and never proposed again (R7). */
  const setAside = async (actor: Actor, studyId: string, sessionId: string, verbatimId: string) => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    if (!study.value.sessions.some((s) => s.id === sessionId))
      return err('SESSION_NOT_FOUND' as const)
    const v = (await deps.store.verbatimsOf(sessionId)).find((x) => x.id === verbatimId)
    if (!v || v.studyId !== studyId) return err('VERBATIM_NOT_FOUND' as const)
    await deps.store.setAside(verbatimId)
    return ok(undefined)
  }

  /**
   * Research R8: a person says which interviewee speaks a label the app could not match, or that
   * an interviewer does.
   */
  const attributeSpeaker = async (
    actor: Actor,
    studyId: string,
    sessionId: string,
    input: { label: string; participant: string },
  ) => {
    const study = await studyOf(deps, actor.id, studyId)
    if (!study.ok) return study
    // An interview of this study the person can see (FR-019), interviewer branch included.
    if (!study.value.sessions.some((s) => s.id === sessionId))
      return err('SESSION_NOT_FOUND' as const)
    const people = (await deps.sources.people(actor.id, studyId, { assign: true }))?.[sessionId]
    const interviewer = input.participant === INTERVIEWER
    if (
      !interviewer &&
      !people?.some((p) => p.role === 'interviewee' && p.code === input.participant)
    )
      return err('VALIDATION' as const)
    // An interviewer's words are no evidence: their verbatims are set aside (FR-005), in the same
    // transaction as the attribution.
    await deps.store.attributeSpeaker({
      sessionId,
      speaker: input.label,
      participant: input.participant,
      setAside: interviewer,
      by: actor.id,
      at: now(),
    })
    return ok(undefined)
  }

  /** Research R9: the other language of a person's statement, in the worker. */
  const translateJob = async (job: TranslateJob): Promise<void> => {
    const fact = await deps.store.getFact(job.factId)
    // Its words changed meanwhile: a newer job (or a person) takes care of it.
    const same =
      job.text === undefined
        ? fact?.version === job.version
        : fact?.statement[job.from] === job.text
    if (!fact || !same || fact.translation !== 'translating') return
    const to = job.from === 'en' ? 'fr' : 'en'
    let translated: string | null = null
    try {
      const text = await deps.ai.translate(job.accountId, translationRef(fact.sessionId), {
        text: fact.statement[job.from],
        from: job.from,
        to,
      })
      const names = await deps.sources.knownNames(job.accountId, fact.studyId)
      const clean = text.trim().slice(0, STATEMENT_MAX)
      translated = clean.length > 0 && !holdsName(clean, names) ? clean : null
    } catch (error) {
      deps.log.warn({ error: String(error), factId: fact.id }, 'translation failed')
    }
    await deps.store.saveFact(
      translated === null
        ? { ...fact, translation: 'not-translated' }
        : { ...fact, statement: { ...fact.statement, [to]: translated }, translation: 'done' },
      fact.version,
    )
  }

  /** A failed translation, tried again (FR-016). */
  const retryTranslation = async (actor: Actor, studyId: string, factId: string) => {
    const found = await factOf(actor, studyId, factId)
    if (!found.ok) return found
    const { fact } = found.value
    if (fact.translation !== 'not-translated') return ok(undefined)
    const from = fact.statement.en.length > 0 ? 'en' : 'fr'
    const next: Fact = { ...fact, translation: 'translating' }
    if ((await deps.store.saveFact(next, fact.version)) !== 'ok')
      return err('VERSION_CONFLICT' as const)
    await deps.enqueueTranslation({
      factId,
      version: fact.version,
      accountId: actor.id,
      from,
      text: fact.statement[from],
    })
    return ok(undefined)
  }

  return {
    decide,
    create,
    acceptMany,
    addVerbatim,
    resizeVerbatim,
    setAside,
    attributeSpeaker,
    translateJob,
    retryTranslation,
  }
}

export type FactCommands = ReturnType<typeof makeFactCommands>
