import type { Clock, Result } from '@goodresearch/shared'
import type { AnswerTerm } from '../domain/answer-check.ts'
import type { CommonWords } from '../domain/candidates.ts'
import type { Batch } from '../domain/excerpts.ts'
import type { LexiconRun, Transcript } from '../domain/lexicon-run.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import type { Occurrence, Verdict } from '../domain/occurrences.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

/** Who may see a study and the team that owns it (research module). */
export type StudyDirectory = {
  getStudyAccess(
    accountId: string,
    studyId: string,
  ): Promise<{
    role: 'admin' | 'member'
    type: string
    teamId: string
    anonymised: boolean
  } | null>
}

export type SourceSession = {
  readonly id: string
  readonly title: string
  readonly interviewDate: string | null
  readonly language: 'en' | 'fr' | 'other' | null
  readonly transcript: {
    readonly fileId: string
    readonly name: string
    readonly mimeType: string
    readonly modifiedAt: string | null
  } | null
}

export type ReadFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'

/** The validated interviews and their transcripts, with one person's own access (ingestion module). */
export type Sources = {
  enrichmentSessions(
    accountId: string,
    studyId: string,
  ): Promise<{ sessions: readonly SourceSession[]; toValidate: number } | null>
  readTranscript(
    accountId: string,
    studyId: string,
    sessionId: string,
  ): Promise<Result<{ text: string; modifiedAt: string | null }, ReadFailure>>
  /** Rosters, schedule, team members: never candidates, never sent to the AI (FR-006). */
  knownNames(accountId: string, studyId: string): Promise<readonly string[]>
}

/** The person has no usable AI connection. */
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

/** The AI part of a reading (research R5), through the AI Gateway, recorded under `ref`. */
export type LexiconAi = {
  /** Throws AiUnavailable or AiFailed. */
  propose(accountId: string, ref: string, batch: Batch): Promise<readonly AnswerTerm[]>
  providerOf(accountId: string): Promise<string | null>
  /** What a reading would cost with the person's model, for `calls` calls; null without a price. */
  estimate(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    calls: number,
  ): Promise<number | null>
  /** Costs of ledger refs, over every account. */
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}

export type SaveOutcome = 'ok' | 'stale' | 'exists'

export type TranscriptsStore = {
  transcriptsOf(studyId: string): Promise<Transcript[]>
  getTranscript(sessionId: string): Promise<Transcript | null>
  saveTranscript(t: Transcript): Promise<void>
  /** The reading of these sessions went through to the end. */
  markRead(sessionIds: readonly string[], at: Date): Promise<void>

  teamTerms(teamId: string): Promise<LexiconTerm[]>
  getTerm(id: string): Promise<LexiconTerm | null>
  /** Writes a new term; `exists` when the team already has an active term of that form. */
  insertTerm(t: LexiconTerm): Promise<SaveOutcome>
  /** Writes the term if its version is still `expected`. */
  saveTerm(t: LexiconTerm, expected: number): Promise<SaveOutcome>
  /**
   * Both terms of a merge in one transaction (plan, Complexity Tracking); the verdicts and the
   * occurrences of every study move to the kept term.
   */
  saveMerge(
    from: LexiconTerm,
    fromExpected: number,
    into: LexiconTerm,
    intoExpected: number,
  ): Promise<SaveOutcome>
  /** Replaces every occurrence of the study at once. */
  replaceOccurrences(studyId: string, rows: readonly Occurrence[]): Promise<void>

  /** Creates the run; false when the study already has one not finished. */
  createRun(run: LexiconRun): Promise<boolean>
  getRun(id: string): Promise<LexiconRun | null>
  openRun(studyId: string): Promise<LexiconRun | null>
  /** Writes the run while it is not finished: a finished run is never opened again. */
  saveRun(run: LexiconRun): Promise<void>
  heartbeat(runId: string, at: Date): Promise<void>
  /** A person asked to stop it, or it was finished elsewhere (replaced as stale). */
  stopRequested(runId: string): Promise<boolean>
  requestStop(runId: string): Promise<void>

  /** The verdicts given on the study's occurrences. */
  verdictsOf(studyId: string): Promise<Verdict[]>
  /** Sets one verdict, or clears it (null). */
  saveVerdict(
    place: Omit<Verdict, 'verdict' | 'decidedBy' | 'decidedAt'> & { studyId: string },
    verdict: { verdict: Verdict['verdict']; decidedBy: string; decidedAt: Date } | null,
  ): Promise<void>
  /** Every occurrence counted in the study. */
  occurrencesOf(studyId: string): Promise<Occurrence[]>
  /** For each term, the number of the team's other studies where it was found. */
  otherStudies(termIds: readonly string[], studyId: string): Promise<ReadonlyMap<string, number>>
  /** The study's runs, the latest first. */
  runsOf(studyId: string): Promise<LexiconRun[]>
  /** Names of accounts (deleted accounts have none). */
  accountNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>

  hasConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, studyId: string, provider: string, at: Date): Promise<void>
}

export type TranscriptsDeps = {
  readonly store: TranscriptsStore
  readonly studies: StudyDirectory
  readonly sources: Sources
  readonly ai: LexiconAi
  readonly common: CommonWords
  readonly enqueue: (job: { runId: string; studyId: string }) => Promise<boolean>
  readonly clock: Clock
  readonly log: { warn(object: object, message: string): void }
}
