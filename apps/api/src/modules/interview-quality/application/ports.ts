import type { Clock, Person } from '@goodresearch/shared'
import type { RemarkKind, Stance } from '../domain/figures.ts'
import type { SentAnswer } from '../domain/remarks.ts'
import type { ReviewRun } from '../domain/review-run.ts'

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

export type TextAnalysed = 'with-corrections' | 'clean-only'

export type StudyAccess = {
  readonly type: string
  readonly anonymised: boolean
  readonly textAnalysed: TextAnalysed
}

export type SourceSession = {
  readonly id: string
  readonly title: string
  readonly interviewDate: string | null
  /** Its transcript file, imported or not; null: the interview has none. */
  readonly transcript: { readonly fileId: string } | null
}

/** What Interview Quality reads from the other modules, through `compose.ts` (research R1). */
export type QualitySources = {
  studyAccess(accountId: string, studyId: string): Promise<StudyAccess | null>
  /** The validated interviews, with the person's own folder access; null without it. */
  sessions(accountId: string, studyId: string): Promise<readonly SourceSession[] | null>
  /** The people of each interview with their codes; `assign` gives the missing codes (a run). */
  people(
    accountId: string,
    studyId: string,
    options: { assign: boolean },
  ): Promise<Readonly<Record<string, readonly Person[]>> | null>
  /** Every name the app knows for the study: never sent to the AI (FR-014). */
  knownNames(accountId: string, studyId: string): Promise<readonly string[]>
  analysedText(
    accountId: string,
    studyId: string,
    sessionId: string,
    mode: TextAnalysed,
    options?: { assign?: boolean },
  ): Promise<AnalysedText | 'no-transcript' | 'not-clean'>
  /** Imports the raw versions missing or changed in Drive; the failures by interview. */
  importTranscripts(
    accountId: string,
    studyId: string,
    sessionIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>
  /** The project's research goal and the guide's main questions. */
  context(accountId: string, studyId: string): Promise<{ goal: string; guide: readonly string[] }>
  /** A person's attributions of an interview's speaker labels, kept by Evidence (research R5). */
  speakerAttributions(sessionId: string): Promise<ReadonlyMap<string, string>>
  /** A lexicon reading or a cleaning of the study runs (FR-013). */
  enrichmentLive(studyId: string): Promise<boolean>
  /** A facts reading of the study runs (FR-013). */
  factsLive(studyId: string): Promise<boolean>
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

/** One part of an interview as the AI gets it: known names as placeholders (FR-014). */
export type ReviewRequest = {
  readonly goal: string
  readonly guide: readonly string[]
  readonly turns: readonly {
    readonly id: string
    /** A role and a code, never a label. */
    readonly speaker: string
    readonly text: string
    readonly context: boolean
    /** The sentences to answer on: only in an interviewer's turn. */
    readonly sentences: readonly { readonly id: string; readonly text: string }[]
  }[]
}

export type QualityAi = {
  /** Throws AiUnavailable or AiFailed. */
  review(accountId: string, ref: string, request: ReviewRequest): Promise<readonly SentAnswer[]>
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

export type Evaluation = {
  readonly sessionId: string
  readonly studyId: string
  readonly runId: string
  readonly rawImportedAt: Date
  readonly textAnalysed: TextAnalysed
  readonly anonymised: boolean
  readonly fingerprint: string
  /** The labels read as interviewers' by the review; null for one older than this record. */
  readonly interviewers: readonly string[] | null
  readonly leftOut: number
  readonly turnsSkipped: number
  readonly readAt: Date
}

export type SpeakerCount = {
  readonly sessionId: string
  readonly studyId: string
  readonly speakerLabel: string
  readonly sentences: number
  readonly questions: number
}

export type StoredReformulation = {
  readonly id: string
  readonly sessionId: string
  readonly studyId: string
  readonly segmentId: string
  readonly offset: number
  readonly length: number
  readonly text: string
  readonly speakerLabel: string
  readonly requalifiedRemarkId: string | null
}

export type StoredRemark = {
  readonly id: string
  readonly sessionId: string
  readonly studyId: string
  readonly runId: string | null
  readonly segmentId: string
  readonly offset: number
  readonly length: number
  readonly text: string
  readonly speakerLabel: string
  readonly kind: RemarkKind
  readonly reason: { readonly en: string; readonly fr: string } | null
  readonly reasonPerson: string | null
  readonly recommendation: string | null
  readonly addedElement: string | null
  readonly origin: 'ai' | 'person'
  readonly stance: Stance | null
  readonly stanceBy: string | null
  readonly stanceAt: Date | null
  readonly version: number
}

export type QualityStore = {
  openRun(studyId: string): Promise<ReviewRun | null>
  runsOf(studyId: string): Promise<ReviewRun[]>
  getRun(id: string): Promise<ReviewRun | null>
  /** Starts a run; false when one is open for the study. */
  startRun(run: ReviewRun): Promise<boolean>
  /** Saves progress while unfinished (a stop request set meanwhile is kept). */
  saveRun(run: ReviewRun): Promise<void>
  requestStop(runId: string): Promise<void>

  evaluationsOf(studyId: string): Promise<Evaluation[]>
  speakerCountsOf(studyId: string): Promise<SpeakerCount[]>
  reformulationsOf(studyId: string): Promise<StoredReformulation[]>
  remarksOf(studyId: string): Promise<StoredRemark[]>
  getRemark(id: string): Promise<StoredRemark | null>
  getReformulation(id: string): Promise<StoredReformulation | null>
  /** Saves an opinion when the version is still the one read; false otherwise. */
  saveStance(remark: StoredRemark, expectedVersion: number): Promise<boolean>
  /** In one transaction: the person's remark and its link; false when already requalified. */
  requalify(remark: StoredRemark, reformulationId: string): Promise<boolean>
  /** In one transaction: removes a person's remark and frees its sentence; false on a conflict. */
  withdrawRemark(remarkId: string, expectedVersion: number): Promise<boolean>
  /**
   * In one transaction: replaces the interview's counts, its reformulations not requalified and its
   * AI remarks without an opinion, and saves the evaluation. Opinions and a person's remarks stay.
   */
  replaceReview(input: {
    readonly evaluation: Evaluation
    readonly counts: readonly SpeakerCount[]
    readonly reformulations: readonly StoredReformulation[]
    readonly remarks: readonly StoredRemark[]
  }): Promise<void>

  hasConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, studyId: string, provider: string, at: Date): Promise<void>
}

export type ReviewJob = {
  readonly runId: string
  readonly studyId: string
  /** The interviews were chosen one by one: one not measurable is read anyway. */
  readonly anyway: boolean
}

export type QualityDeps = {
  readonly store: QualityStore
  readonly sources: QualitySources
  readonly ai: QualityAi
  readonly clock: Clock
  readonly enqueueRun: (job: ReviewJob) => Promise<boolean>
  readonly log: { warn(object: object, message: string): void }
}
