import type { Clock, Result } from '@goodresearch/shared'
import type { AnalysisFailure, SessionAnalysis, Stage } from '../domain/analysis.ts'
import type { Observation, ObservationKind } from '../domain/observation.ts'
import type { TaskResult } from '../domain/task-result.ts'
import type { Segment } from '../domain/transcript.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

/** A test session as Ingestion gives it (spec 037), with what the analysis needs. */
export type SessionRef = {
  readonly sessionId: string
  readonly studyId: string
  readonly title: string
  readonly state: 'proposed' | 'validated' | 'excluded'
  readonly readiness: string | null
  readonly protocolVersion: number | null
  readonly video: {
    readonly fileId: string
    readonly name: string
    readonly modifiedAt: string | null
    readonly size: number | null
    readonly durationMs: number | null
  } | null
  /** The pseudonym on an anonymised study. */
  readonly participant: string | null
  readonly facilitators: readonly string[]
  readonly hasPeople: boolean
}

export type StudyAccess =
  | {
      readonly kind: 'full'
      readonly type: string
      readonly anonymised: boolean
      readonly teamId: string
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'folder-required' }

export type VideoRange = {
  readonly status: 200 | 206
  readonly contentType: string
  readonly contentLength: number | null
  readonly contentRange: string | null
  readonly body: AsyncIterable<Uint8Array>
}

/** Ingestion's sessions, video bytes, consent and people proposals (through its index). */
export type Sessions = {
  access(accountId: string, studyId: string): Promise<StudyAccess>
  list(accountId: string, studyId: string): Promise<readonly SessionRef[]>
  one(accountId: string, sessionId: string): Promise<SessionRef | null>
  /** The study and video file of a session, cheaply, for the player's range requests. */
  video(sessionId: string): Promise<{ studyId: string; fileId: string } | null>
  download(
    accountId: string,
    studyId: string,
    fileId: string,
    toPath: string,
  ): Promise<{ bytes: number } | 'not-found' | 'access-lost'>
  range(
    accountId: string,
    studyId: string,
    fileId: string,
    range: string | null,
  ): Promise<VideoRange | null | 'access-lost'>
  hasConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, studyId: string, provider: string): Promise<void>
  knownNames(studyId: string): Promise<readonly string[]>
  proposePeopleFromText(accountId: string, sessionId: string, text: string): Promise<void>
}

/** A test task as the protocol version of a session holds it (spec 036). */
export type ProtocolTask = {
  readonly id: string
  readonly instruction: string
  readonly criterion: string
}

export type ProtocolOfSession = {
  readonly version: number
  readonly language: 'en' | 'fr'
  readonly scenario: string
  readonly tasks: readonly ProtocolTask[]
  readonly sus: boolean
  readonly ease: boolean
}

/** Research's protocol versions (through its index). */
export type Protocols = {
  version(studyId: string, version: number): Promise<ProtocolOfSession | null>
}

/** A temporary copy the AI provider reads (research R4); `uri` is what the model gets. */
export type StagedFile = { readonly uri: string; readonly mimeType: string }

export type Staging = {
  upload(accountId: string, localPath: string, name: string, mimeType: string): Promise<StagedFile>
  remove(accountId: string, files: readonly StagedFile[]): Promise<void>
}

/** Frames and sound taken from the local copy (ffmpeg in the worker, research R5). */
export type Frame = { readonly atMs: number; readonly jpeg: Uint8Array }

export type MediaTools = {
  /** A fresh working directory; `release` removes it and everything in it. */
  workdir(): Promise<{ readonly path: string; release(): Promise<void> }>
  durationMs(video: string): Promise<number>
  frames(
    video: string,
    atMs: readonly number[],
    crop: Crop | null,
    width?: number,
  ): Promise<Frame[]>
  /** One frame every `everyMs`, near-duplicates dropped, cropped to the shared screen. */
  keyframes(video: string, everyMs: number, crop: Crop | null): Promise<Frame[]>
  /** The sound of a span, as a compressed audio file next to the video. */
  audio(video: string, startMs: number, endMs: number, out: string): Promise<string>
}

/** The shared screen's box, in pixels of the layout frames (960 wide); scaled to each video. */
export type Crop = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The model's view of a moment of the session, for the readings and checks. */
export type ScreenLogEntry = {
  readonly atMs: number
  readonly screen: string
  readonly action: string
}

export type TaskSpan = {
  readonly taskId: string
  readonly startMs: number | null
  readonly endMs: number | null
  readonly found: boolean
  readonly note: string
}

export type FoundObservation = {
  readonly kind: ObservationKind
  readonly momentMs: number
  readonly text: string
  readonly quote: string | null
  readonly seen: string | null
  readonly susItem: number | null
  readonly susValue: number | null
}

export type TaskReading = {
  readonly outcome: TaskResult['outcome']
  readonly path: string
  readonly ease: number | null
  readonly assisted: boolean
  readonly observations: readonly FoundObservation[]
}

/** The model calls of the pipeline (research R3), each recorded in the ledger under `ref`. */
export type AnalysisAi = {
  layout(accountId: string, ref: string, frames: readonly Frame[]): Promise<Crop | null>
  transcript(
    accountId: string,
    ref: string,
    audio: StagedFile,
    span: { startMs: number; endMs: number },
    language: 'en' | 'fr',
  ): Promise<{ language: string | null; segments: Segment[] }>
  screenLog(accountId: string, ref: string, frames: readonly Frame[]): Promise<ScreenLogEntry[]>
  taskMap(
    accountId: string,
    ref: string,
    input: {
      tasks: readonly ProtocolTask[]
      scenario: string
      transcript: readonly Segment[]
      log: readonly ScreenLogEntry[]
      durationMs: number
    },
  ): Promise<TaskSpan[]>
  task(
    accountId: string,
    ref: string,
    input: {
      video: StagedFile
      task: ProtocolTask
      span: { startMs: number; endMs: number }
      transcript: readonly Segment[]
      log: readonly ScreenLogEntry[]
      language: 'en' | 'fr'
      sus: boolean
      ease: boolean
    },
  ): Promise<TaskReading>
  judge(
    accountId: string,
    ref: string,
    input: {
      observation: FoundObservation
      task: ProtocolTask
      frames: readonly Frame[]
      transcript: readonly Segment[]
    },
  ): Promise<{
    verdict: 'kept' | 'not-confirmed' | 'rejected'
    reason: string
    contrary: string | null
  }>
  arbiter(
    accountId: string,
    ref: string,
    input: {
      observation: FoundObservation
      task: ProtocolTask
      frames: readonly Frame[]
      transcript: readonly Segment[]
      judge: { verdict: string; reason: string }
    },
  ): Promise<{ verdict: 'kept' | 'rejected'; reason: string }>
  providerOf(accountId: string): Promise<string | null>
  estimate(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    tier: 'standard' | 'strong',
  ): Promise<number | null>
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}

/** The app's storage for screenshots (FR-020). */
export type Screens = {
  put(key: string, jpeg: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  deleteByPrefix(prefix: string): Promise<number>
}

/** Evidence's facts from observations (FR-022, through its index). */
export type Facts = {
  upsert(input: {
    accountId: string
    observationId: string
    studyId: string
    sessionId: string
    statement: string
    language: 'en' | 'fr'
    polarity: 'positive' | 'negative' | 'neutral'
    theme: { id: string; title: string }
    quote: string | null
    momentMs: number
    screenshotKey: string | null
    participant: string | null
    origin: 'ai' | 'person'
    /** Refused when the statement names a person (a fact never does) or is empty. */
  }): Promise<Result<{ factId: string }, 'VALIDATION' | 'NAME_IN_STATEMENT'>>
  withdraw(observationId: string): Promise<void>
}

export type AnalysisRun = {
  readonly id: string
  readonly studyId: string
  readonly startedBy: string
  readonly sessionIds: readonly string[]
  readonly state: 'running' | 'stopped' | 'done'
  readonly stopRequested: boolean
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

export type AnalysisJob = {
  readonly runId: string
  readonly studyId: string
  readonly accountId: string
}

/** What the pipeline saves when a session is done. */
export type AnalysisOutput = {
  readonly language: string | null
  readonly segments: readonly Segment[]
  readonly tasks: readonly TaskResult[]
  readonly observations: readonly Observation[]
  readonly screenshots: readonly string[]
}

export interface UsabilityStore {
  analysisOf(sessionId: string): Promise<SessionAnalysis | null>
  analysesOf(studyId: string): Promise<SessionAnalysis[]>
  /** Starts (or restarts) the analysis of a session; the previous one's decided items are kept. */
  beginAnalysis(a: SessionAnalysis): Promise<void>
  /** Puts an analysis back as it was (a run that could not be queued). */
  restoreAnalysis(a: SessionAnalysis): Promise<void>
  setStage(analysisId: string, stage: Stage): Promise<void>
  failAnalysis(analysisId: string, failure: AnalysisFailure, now: Date): Promise<void>
  /** Saves the outputs and marks the analysis done, keeping the decided items of the previous one. */
  completeAnalysis(analysisId: string, output: AnalysisOutput, now: Date): Promise<void>
  transcriptOf(analysisId: string): Promise<{ language: string | null; segments: Segment[] } | null>
  taskResultsOf(analysisIds: readonly string[]): Promise<TaskResult[]>
  observationsOf(analysisIds: readonly string[]): Promise<Observation[]>
  /** Observations and task results still to review, counted per analysis. */
  toReviewCounts(analysisIds: readonly string[]): Promise<Map<string, number>>
  observation(id: string): Promise<Observation | null>
  taskResult(id: string): Promise<TaskResult | null>
  /** Writes if the version is still `expected` (and adds one). */
  saveObservation(o: Observation, expected: number): Promise<'saved' | 'stale'>
  addObservation(o: Observation): Promise<void>
  saveTaskResult(r: TaskResult, expected: number): Promise<'saved' | 'stale'>
  analysisById(id: string): Promise<SessionAnalysis | null>
  startRun(run: AnalysisRun): Promise<boolean>
  lastRun(studyId: string): Promise<AnalysisRun | null>
  getRun(id: string): Promise<AnalysisRun | null>
  heartbeat(runId: string, now: Date): Promise<void>
  requestStop(runId: string): Promise<void>
  finishRun(runId: string, state: 'stopped' | 'done', now: Date): Promise<void>
  /** Recorded before the image is stored: one left by a failed analysis is still swept. */
  registerScreenshot(key: string, studyId: string, now: Date): Promise<void>
  /** Keys of screenshots no observation refers to any more; their rows are removed. */
  /** Unreferenced screenshots registered before `registeredBefore`, removed from the register. */
  orphanScreenshots(registeredBefore: Date): Promise<string[]>
}

export type UsabilityDeps = {
  readonly store: UsabilityStore
  readonly sessions: Sessions
  readonly protocols: Protocols
  readonly staging: Staging
  readonly media: MediaTools
  readonly ai: AnalysisAi
  readonly screens: Screens
  readonly facts: Facts
  readonly enqueue: (job: AnalysisJob) => Promise<boolean>
  readonly clock: Clock
  readonly newId: () => string
  readonly log: {
    warn(object: object, message: string): void
    error(object: object, message: string): void
  }
}

/** The AI provider in use refused the person's access: they connect it again (FR-019). */
export class ProviderAccessLost extends Error {
  override name = 'ProviderAccessLost'
}

/** The AI provider in use cannot read video. */
export class ProviderMediaUnsupported extends Error {
  override name = 'ProviderMediaUnsupported'
}

/** No AI provider serves the person any more. */
export class ProviderMissing extends Error {
  override name = 'ProviderMissing'
}
