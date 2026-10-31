/** A run without heartbeat for this long died (as the runs of spec 012). */
export const RUN_STALE_MS = 10 * 60_000

export type ReviewFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'
  | 'NOT_CLEAN'
  | 'INTERRUPTED'
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'

export type ReviewProgress = {
  readonly sessionId: string
  readonly state: 'waiting' | 'reading' | 'done' | 'failed'
  readonly chunks: number
  readonly chunksDone: number
  readonly failure?: ReviewFailure
}

/** One "Review the interviews" over a study (spec 016 FR-013). */
export type ReviewRun = {
  readonly id: string
  readonly studyId: string
  readonly startedBy: string
  readonly sessions: readonly ReviewProgress[]
  readonly stopRequested: boolean
  /** Dropped or reclassified by the app's checks (FR-004). */
  readonly leftOut: number
  readonly failure: ReviewFailure | null
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

/** The ledger ref of a review's AI calls, per run and interview (FR-015). */
export const reviewRef = (runId: string, sessionId: string) => `quality:${runId}:${sessionId}`

export const isReviewLive = (run: ReviewRun | null, now: Date): run is ReviewRun =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

export const reviewRunState = (run: ReviewRun): 'running' | 'stopping' | 'finished' | 'stopped' =>
  run.finishedAt
    ? run.stopRequested
      ? 'stopped'
      : 'finished'
    : run.stopRequested
      ? 'stopping'
      : 'running'

/** A run that stopped without finishing: its interviews still open are interrupted. */
export const interruptedReview = (run: ReviewRun, now: Date): ReviewRun => ({
  ...run,
  finishedAt: now,
  sessions: run.sessions.map((s) =>
    s.state === 'done' || s.state === 'failed'
      ? s
      : { ...s, state: 'failed', failure: 'INTERRUPTED' },
  ),
})
