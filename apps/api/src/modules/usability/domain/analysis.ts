/** The analysis of one test session (spec 038): its state, its step, what it read. */
export const STAGES = [
  'preparing',
  'transcript',
  'screen-log',
  'task-map',
  'tasks',
  'checks',
] as const
export type Stage = (typeof STAGES)[number]

export type AnalysisState = 'waiting' | 'analysing' | 'done' | 'failed' | 'stopped'

export type AnalysisFailure =
  | 'VIDEO_UNREADABLE'
  | 'AI_PROVIDER_REQUIRED'
  | 'MEDIA_NOT_SUPPORTED'
  | 'AI_FAILED'
  | 'STAGING_FAILED'
  | 'STOPPED'

export type SessionAnalysis = {
  readonly id: string
  readonly studyId: string
  readonly sessionId: string
  readonly protocolVersion: number
  readonly videoFileId: string
  readonly videoModifiedAt: string | null
  readonly videoSize: number | null
  readonly state: AnalysisState
  readonly stage: Stage | null
  readonly failure: AnalysisFailure | null
  readonly runId: string | null
  readonly startedBy: string
  readonly startedAt: Date
  readonly finishedAt: Date | null
  readonly version: number
}

/** The ledger reference of a session's analysis calls: its cost per session and per study. */
export const usabilityRef = (sessionId: string) => `usability-analysis:${sessionId}`

/**
 * Out of date when the session's protocol version or its video changed since the analysis read
 * them (FR-008).
 */
export const outOfDate = (
  a: Pick<SessionAnalysis, 'protocolVersion' | 'videoFileId' | 'videoModifiedAt' | 'videoSize'>,
  now: {
    readonly protocolVersion: number | null
    readonly video: { fileId: string; modifiedAt: string | null; size: number | null } | null
  },
): boolean =>
  now.protocolVersion !== a.protocolVersion ||
  !now.video ||
  now.video.fileId !== a.videoFileId ||
  now.video.modifiedAt !== a.videoModifiedAt ||
  now.video.size !== a.videoSize

/** A run without heartbeat for this long is replaced (a stage reports at least every minute). */
export const RUN_STALE_MS = 10 * 60_000
