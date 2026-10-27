import { RUN_STALE_MS } from './lexicon-run.ts'

export type CleaningFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'
  | 'INTERRUPTED'
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'

export type CleaningProgress = {
  readonly sessionId: string
  readonly state: 'waiting' | 'cleaning' | 'done' | 'failed'
  readonly chunks: number
  readonly chunksDone: number
  readonly failure?: CleaningFailure
}

/** One "Clean transcripts" over a study (spec 011 research R6). */
export type CorrectionRun = {
  readonly id: string
  readonly studyId: string
  readonly teamId: string
  readonly startedBy: string
  /** `lexicon`: no AI, no cost. */
  readonly mode: 'lexicon' | 'ai'
  readonly sessions: readonly CleaningProgress[]
  readonly stopRequested: boolean
  /** AI corrections dropped by the checks (FR-006). */
  readonly leftOut: number
  readonly failure: CleaningFailure | null
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

/**
 * The ledger ref of a cleaning's AI calls: per run and interview, so each interview shows what its
 * cleanings cost (as an analysis in Fieldwork). `cleaning:<runId>` alone: calls of the first runs.
 */
export const cleaningRef = (runId: string, sessionId?: string) =>
  sessionId ? `cleaning:${runId}:${sessionId}` : `cleaning:${runId}`

/** Every ref a run may have written in the ledger. */
export const cleaningRefs = (run: Pick<CorrectionRun, 'id' | 'sessions'>) => [
  cleaningRef(run.id),
  ...run.sessions.map((s) => cleaningRef(run.id, s.sessionId)),
]

/**
 * The refs of one interview in a run. The first runs wrote one ref per run: when such a run
 * cleaned only this interview, its calls are this interview's too.
 */
export const interviewRefs = (run: Pick<CorrectionRun, 'id' | 'sessions'>, sessionId: string) => [
  cleaningRef(run.id, sessionId),
  ...(run.sessions.length === 1 && run.sessions[0]?.sessionId === sessionId
    ? [cleaningRef(run.id)]
    : []),
]

/** Live: not finished and with a heartbeat in the last 10 minutes (as a lexicon reading). */
export const isCleaningLive = (run: CorrectionRun | null, now: Date): run is CorrectionRun =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/** A run that stopped without finishing: its interviews still waiting or cleaning are interrupted. */
export const interruptedCleaning = (run: CorrectionRun, now: Date): CorrectionRun => ({
  ...run,
  finishedAt: now,
  sessions: run.sessions.map((s) =>
    s.state === 'waiting' || s.state === 'cleaning'
      ? { ...s, state: 'failed', failure: 'INTERRUPTED' }
      : s,
  ),
})
