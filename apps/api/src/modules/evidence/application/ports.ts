import type { Clock } from '@goodresearch/shared'
import type { FactsRun } from '../domain/analysis-run.ts'
import type { TextAnalysed } from '../domain/analysis-state.ts'
import type { Fact, Polarity } from '../domain/facts.ts'
import type { Person } from '../domain/speakers.ts'

/** A turn of the analysed text (same ids as the raw version). */
export type Turn = {
  readonly id: string
  readonly speaker: string | null
  readonly start: number | null
  readonly text: string
}

export type AnalysedText = {
  readonly turns: readonly Turn[]
  readonly rawImportedAt: Date
  readonly fingerprint: string
}

export type StudyAccess = {
  readonly role: 'admin' | 'member'
  readonly type: string
  readonly teamId: string
  readonly anonymised: boolean
  readonly textAnalysed: TextAnalysed
}

export type SourceSession = {
  readonly id: string
  readonly title: string
  readonly interviewDate: string | null
}

/** What Evidence reads from the other modules, through `compose.ts` (research R1). */
export type AnalysisSources = {
  studyAccess(accountId: string, studyId: string): Promise<StudyAccess | null>
  /** The validated interviews, with the person's own folder access; null without it. */
  sessions(accountId: string, studyId: string): Promise<readonly SourceSession[] | null>
  /** The people of each interview with their codes; `assign` gives the missing codes (a run). */
  people(
    accountId: string,
    studyId: string,
    options: { assign: boolean },
  ): Promise<Readonly<Record<string, readonly Person[]>> | null>
  /** Every name the app knows for the study: never sent to the AI (FR-007). */
  knownNames(accountId: string, studyId: string): Promise<readonly string[]>
  analysedText(
    accountId: string,
    studyId: string,
    sessionId: string,
    mode: TextAnalysed,
    options?: { assign?: boolean },
  ): Promise<AnalysedText | 'no-transcript' | 'not-clean'>
  /** Imports the raw versions missing or changed in Drive (FR-003); the failures by interview. */
  importTranscripts(
    accountId: string,
    studyId: string,
    sessionIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>
  /** The project's research goal and the guide's theme sections (research R12). */
  context(
    accountId: string,
    studyId: string,
  ): Promise<{ goal: string; themes: readonly { id: string; title: string }[] }>
  /** A lexicon reading or a cleaning of the study runs (FR-012). */
  enrichmentLive(studyId: string): Promise<boolean>
}

/** The provider is not connected (anymore). */
export class AiUnavailable extends Error {
  override name = 'AiUnavailable'
}
/** The provider failed, or answered in a shape that does not fit. */
export class AiFailed extends Error {
  override name = 'AiFailed'
  readonly invalid: boolean
  constructor(invalid: boolean) {
    super(invalid ? 'invalid answer' : 'provider failed')
    this.invalid = invalid
  }
}

export type VerbatimRequest = {
  readonly goal: string
  readonly themes: readonly string[]
  readonly turns: readonly {
    readonly id: string
    readonly role: 'interviewee' | 'interviewer' | 'unknown'
    readonly speaker: string
    readonly text: string
    readonly context: boolean
  }[]
}

export type FactRequest = {
  readonly goal: string
  /**
   * The interview's facts already there (spec 012 FR-010, update): the AI takes one up by its ref
   * rather than writing it again; a decided one is never changed.
   */
  readonly existing: readonly {
    readonly ref: string
    readonly statement: string
    readonly polarity: Polarity
    readonly theme: string
    readonly status: 'decided' | 'to decide'
    readonly verbatims: readonly string[]
  }[]
  readonly themes: readonly { readonly id: string; readonly title: string }[]
  readonly verbatims: readonly {
    readonly id: string
    readonly speaker: string
    readonly text: string
  }[]
}

export type FactAnswer = {
  /** An existing fact taken up (`F1`…); absent for a new one. */
  readonly ref?: string | undefined
  readonly statement: { readonly en: string; readonly fr: string }
  readonly polarity: Polarity
  readonly theme: string
  readonly verbatims: readonly string[]
}

export type FactsAi = {
  /** Throws AiUnavailable or AiFailed. */
  verbatims(
    accountId: string,
    ref: string,
    request: VerbatimRequest,
  ): Promise<readonly { turn: string; text: string; reason: string | null }[]>
  facts(accountId: string, ref: string, request: FactRequest): Promise<readonly FactAnswer[]>
  translate(
    accountId: string,
    ref: string,
    request: { text: string; from: 'en' | 'fr'; to: 'en' | 'fr' },
  ): Promise<string>
  providerOf(accountId: string): Promise<string | null>
  estimate(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    calls: number,
  ): Promise<number | null>
  /** Costs of ledger refs, over every account. */
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}

export type StoredVerbatim = {
  readonly id: string
  readonly sessionId: string
  readonly studyId: string
  readonly segmentId: string
  readonly offset: number
  readonly length: number
  readonly text: string
  readonly speaker: string | null
  readonly participant: string | null
  readonly reason: string | null
  readonly origin: 'ai' | 'person'
  readonly runId: string | null
  readonly setAside: boolean
  readonly createdBy: string
  readonly createdAt: Date
}

export type Reading = {
  readonly sessionId: string
  readonly studyId: string
  readonly runId: string
  readonly readAt: Date
  readonly rawImportedAt: Date
  readonly textAnalysed: TextAnalysed
  readonly anonymised: boolean
  readonly fingerprint: string
}

export type SaveOutcome = 'ok' | 'stale'

export type EvidenceStore = {
  openRun(studyId: string): Promise<FactsRun | null>
  runsOf(studyId: string): Promise<FactsRun[]>
  getRun(id: string): Promise<FactsRun | null>
  /** Starts a run; false when one is open for the study. */
  startRun(run: FactsRun): Promise<boolean>
  /** Saves progress while unfinished (a stop request set meanwhile is kept). */
  saveRun(run: FactsRun): Promise<void>
  requestStop(runId: string): Promise<void>
  /**
   * Takes one interview out of a run, in the same write that checks its reading is still open;
   * false when it is too late. Kept whatever the run saves next.
   */
  requestSessionStop(runId: string, sessionId: string): Promise<boolean>

  readingsOf(studyId: string): Promise<Reading[]>
  verbatimsOf(sessionId: string): Promise<StoredVerbatim[]>
  verbatimsOfStudy(studyId: string): Promise<StoredVerbatim[]>
  factsOf(sessionId: string): Promise<Fact[]>
  factsOfStudy(studyId: string): Promise<Fact[]>
  /** Facts by id, any status; absent ids are skipped. */
  factsByIds(ids: readonly string[]): Promise<Fact[]>
  verbatimsByIds(ids: readonly string[]): Promise<StoredVerbatim[]>
  getFact(id: string): Promise<Fact | null>
  /**
   * Research R7, in one transaction: drops the interview's facts still proposed and its AI
   * verbatims no decided fact uses (except `keep`), adds the new ones, saves the reading. A fact
   * taken up by the reading but decided meanwhile is left as the person decided it.
   */
  replaceReading(input: {
    readonly sessionId: string
    readonly keep: readonly string[]
    readonly verbatims: readonly StoredVerbatim[]
    readonly facts: readonly Fact[]
    readonly reading: Reading
  }): Promise<void>
  /** Saves a fact if its version is still `expected` (null: a new fact). */
  saveFact(fact: Fact, expected: number | null): Promise<SaveOutcome>
  /**
   * Adds a person's verbatim, and attaches it to a fact still at version `expected` in the same
   * transaction: when the fact changed meanwhile, nothing is saved ('stale').
   */
  addVerbatim(v: StoredVerbatim, attachTo?: { fact: Fact; expected: number }): Promise<SaveOutcome>
  /** A person's new bounds for a verbatim: it becomes theirs (origin `person`). */
  resizeVerbatim(
    id: string,
    place: {
      segmentId: string
      offset: number
      length: number
      text: string
      speaker: string | null
      participant: string | null
    },
  ): Promise<void>
  /** Sets a verbatim aside and removes it from the facts still to decide. */
  setAside(verbatimId: string): Promise<void>
  /** Saves the places verbatims moved to (research R3). */
  moveVerbatims(
    moves: readonly { id: string; segmentId: string; offset: number; length: number }[],
  ): Promise<void>
  /**
   * A person attributes a speaker label; its verbatims get the participant. With `setAside` (an
   * interviewer's label), its verbatims are set aside in the same transaction.
   */
  attributeSpeaker(input: {
    sessionId: string
    speaker: string
    participant: string
    setAside: boolean
    by: string
    at: Date
  }): Promise<void>
  speakersOf(sessionId: string): Promise<ReadonlyMap<string, string>>

  hasConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, studyId: string, provider: string, at: Date): Promise<void>
  accountNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>
}

export type FactsJob = {
  readonly runId: string
  readonly studyId: string
  /** Read every interview again, not only the open ones. */
  readonly all: boolean
}

export type TranslateJob = {
  readonly factId: string
  readonly version: number
  readonly accountId: string
  readonly from: 'en' | 'fr'
  /**
   * The statement the person wrote: the job applies while it is still the fact's, whatever else
   * changed (a decision, the polarity). Jobs queued without it follow the version.
   */
  readonly text?: string | undefined
}

export type EvidenceDeps = {
  readonly store: EvidenceStore
  readonly sources: AnalysisSources
  readonly ai: FactsAi
  readonly clock: Clock
  readonly enqueueRun: (job: FactsJob) => Promise<boolean>
  readonly enqueueTranslation: (job: TranslateJob) => Promise<boolean>
  readonly log: { warn(object: object, message: string): void }
}
