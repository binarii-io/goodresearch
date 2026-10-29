import type { Clock, Result } from '@goodresearch/shared'
import type { AnswerTerm } from '../domain/answer-check.ts'
import type { CommonWords } from '../domain/candidates.ts'
import type { DocModel } from '../domain/clean-doc.ts'
import type { AnswerCorrection, AnswerDecision, SentChunk } from '../domain/correction-check.ts'
import type { CorrectionRun } from '../domain/correction-run.ts'
import type { Correction, NameDecision, Suggestion } from '../domain/corrections.ts'
import type { Batch } from '../domain/excerpts.ts'
import type { LexiconRun, Transcript } from '../domain/lexicon-run.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import type { Occurrence, Verdict } from '../domain/occurrences.ts'
import type { Segment } from '../domain/segments.ts'

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

export type ConsentPurpose = 'lexicon' | 'cleaning'

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
  /**
   * Takes one interview out of the run, in the same write that checks it is still open (waiting or
   * reading, during the import); false when it is too late. `saveRun` never clears it.
   */
  requestSessionStop(runId: string, sessionId: string): Promise<boolean>

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

  /** `lexicon` by default; spec 011 asks again for `cleaning` (the full text is sent). */
  hasConsent(
    accountId: string,
    studyId: string,
    provider: string,
    purpose?: ConsentPurpose,
  ): Promise<boolean>
  giveConsent(
    accountId: string,
    studyId: string,
    provider: string,
    at: Date,
    purpose?: ConsentPurpose,
  ): Promise<void>
}

export type TranscriptsDeps = {
  readonly store: TranscriptsStore
  readonly studies: StudyDirectory
  readonly sources: Sources
  readonly ai: LexiconAi
  readonly common: CommonWords
  readonly enqueue: (job: { runId: string; studyId: string }) => Promise<boolean>
  /** A cleaning is live for the study (spec 011): a lexicon reading waits. */
  readonly otherRunLive?: (studyId: string) => Promise<boolean>
  readonly clock: Clock
  readonly log: { warn(object: object, message: string): void }
}

// Spec 011 — Cleaning.

/** A person of an interview with their code (`P01`, `I01`), from the study's pseudonyms. */
export type CleaningPerson = {
  readonly name: string
  readonly role: 'interviewer' | 'interviewee'
  readonly code: string
}

/**
 * The people of the study's interviews, by session, for the names in the clean versions
 * (ingestion module). Codes are given only with `assign` (runs, validation): queries only read.
 */
export type CleaningNames = (
  accountId: string,
  studyId: string,
  options: { assign: boolean },
) => Promise<{
  anonymised: boolean
  people: Readonly<Record<string, readonly CleaningPerson[]>>
} | null>

export type CleanFileError = 'DRIVE_NOT_CONNECTED' | 'DRIVE_CANNOT_EDIT' | 'DRIVE_CHANGED_MEANWHILE'

export type CleanFilesError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NO_SOURCE_FOLDER'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_UNAVAILABLE'
  | 'DRIVE_WRITE_REQUIRED'

export type CleanFileMeta = {
  readonly trashed: boolean
  readonly parents: readonly string[]
  readonly webViewLink: string
}

/** The study folder with the person's own write access (ingestion module, research R8). */
export type CleanFiles = {
  /** The subfolder kept by id when still in the study folder, else a new one. */
  ensureFolder(
    name: string,
    knownId: string | null,
  ): Promise<Result<{ id: string }, CleanFileError>>
  createDocument(
    folderId: string,
    name: string,
    doc: DocModel,
  ): Promise<Result<{ id: string; webViewLink: string }, CleanFileError>>
  /** The document's revision now; null when it is gone. */
  revision(fileId: string): Promise<Result<string | null, CleanFileError>>
  rewriteDocument(
    fileId: string,
    doc: DocModel,
    revision: string,
  ): Promise<Result<void, CleanFileError>>
  metadata(fileId: string): Promise<Result<CleanFileMeta | null, CleanFileError>>
}

export type CleanFilesPort = (
  accountId: string,
  studyId: string,
) => Promise<Result<CleanFiles, CleanFilesError>>

/** What one AI call of a cleaning gets (research R4). */
export type CleaningRequest = {
  readonly chunk: SentChunk
  readonly terms: readonly {
    readonly form: string
    readonly variants: readonly string[]
    readonly definition: string | null
    readonly scope: 'global' | 'case-by-case'
  }[]
  /** The speakers as sent (placeholders). */
  readonly speakers: readonly string[]
  readonly anonymised: boolean
}

/** The AI part of a cleaning, through the AI Gateway, recorded under `ref`. */
export type CleaningAi = {
  /** Throws AiUnavailable or AiFailed. */
  correct(
    accountId: string,
    ref: string,
    request: CleaningRequest,
  ): Promise<{ corrections: readonly AnswerCorrection[]; decisions: readonly AnswerDecision[] }>
}

export type CleaningRow = {
  readonly sessionId: string
  readonly studyId: string
  readonly aiReadSegments: readonly string[]
  readonly anonymised: boolean
  readonly lastRunId: string | null
  readonly cleanedAt: Date
}

export type CleanVersion = {
  readonly sessionId: string
  readonly number: number
  readonly segments: readonly Segment[]
  readonly rawImportedAt: Date
  readonly anonymised: boolean
  readonly fingerprint: string
  readonly createdBy: string
  readonly createdAt: Date
}

export type CleanPublication = {
  readonly sessionId: string
  readonly fileId: string
  readonly fileName: string
  readonly webLink: string
  readonly versionNumber: number
  readonly revision: string | null
  readonly publishedBy: string
  readonly publishedAt: Date
}

export type CleaningStore = {
  /** The AI's and the people's corrections of an interview. */
  storedCorrections(sessionId: string): Promise<Correction[]>
  /** `exists` when the same correction is there already. */
  insertCorrection(
    c: Correction,
    studyId: string,
    runId: string | null,
    at: Date,
  ): Promise<'ok' | 'exists'>
  /** Writes it if its version is still `expected`. */
  saveCorrection(c: Correction, expected: number): Promise<'ok' | 'stale'>
  /**
   * The findings of a run on the turns it read, in one transaction: the undecided AI corrections
   * and the suggestions on those turns are replaced; decided ones stay (FR-013).
   */
  replaceFindings(input: {
    studyId: string
    sessionId: string
    runId: string
    readSegments: readonly string[]
    corrections: readonly Correction[]
    suggestions: readonly Suggestion[]
    anonymised: boolean
    at: Date
  }): Promise<void>
  /** A run went through for an interview (lexicon only: nothing read by the AI). */
  markCleaned(input: {
    studyId: string
    sessionId: string
    runId: string
    anonymised: boolean
    at: Date
  }): Promise<void>
  suggestionsOf(sessionId: string): Promise<Suggestion[]>
  decisionsOf(sessionId: string): Promise<Map<string, NameDecision>>
  saveDecision(sessionId: string, key: string, decision: NameDecision | null): Promise<void>
  cleaningsOf(studyId: string): Promise<CleaningRow[]>
  /** Every version of an interview, the latest first, without their turns. */
  versionsOf(sessionId: string): Promise<Omit<CleanVersion, 'segments'>[]>
  /** The latest version with its turns. */
  latestVersion(sessionId: string): Promise<CleanVersion | null>
  /** The latest version of each interview of the study, without its turns. */
  latestVersions(studyId: string): Promise<Map<string, Omit<CleanVersion, 'segments'>>>
  /** Writes the next number; returns it. */
  addVersion(v: Omit<CleanVersion, 'number'>): Promise<number>
  publicationOf(sessionId: string): Promise<CleanPublication | null>
  publicationsOf(studyId: string): Promise<Map<string, CleanPublication>>
  savePublication(p: CleanPublication): Promise<void>
  folderOf(studyId: string): Promise<{ folderId: string; name: string } | null>
  saveFolder(studyId: string, folderId: string, name: string): Promise<void>

  createCleaningRun(run: CorrectionRun): Promise<boolean>
  getCleaningRun(id: string): Promise<CorrectionRun | null>
  openCleaningRun(studyId: string): Promise<CorrectionRun | null>
  saveCleaningRun(run: CorrectionRun): Promise<void>
  cleaningHeartbeat(runId: string, at: Date): Promise<void>
  cleaningStopRequested(runId: string): Promise<boolean>
  requestCleaningStop(runId: string): Promise<void>
  cleaningRunsOf(studyId: string): Promise<CorrectionRun[]>
}

export type CleaningJob = {
  readonly runId: string
  readonly studyId: string
  readonly all: boolean
}

export type CleaningDeps = TranscriptsDeps & {
  readonly cleaning: CleaningStore
  readonly cleaningAi: CleaningAi
  readonly cleaningNames: CleaningNames
  readonly cleanFiles: CleanFilesPort
  readonly enqueueCleaning: (job: CleaningJob) => Promise<boolean>
}
