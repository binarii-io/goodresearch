/** A run with no heartbeat for this long has stopped (worker gone). */
export const RUN_STALE_MS = 10 * 60_000

export type InsightsFailure =
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'
  | 'INTERRUPTED'
  | 'NO_FACTS'

/** "Find insights" over a project (spec 013 FR-015): one unfinished at a time per project. */
export type InsightRun = {
  readonly id: string
  readonly projectId: string
  readonly teamId: string
  readonly startedBy: string
  readonly studyIds: readonly string[]
  readonly scope: 'all' | 'unlinked'
  /** The facts still to decide are sent too (spec 013 FR-003, update). */
  readonly withProposed: boolean
  readonly calls: number
  readonly callsDone: number
  readonly stopRequested: boolean
  readonly leftOut: number
  readonly failure: InsightsFailure | null
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

/** Ledger ref of one call of a run (research R10). */
export const insightsRef = (runId: string, call: number) => `insights:${runId}:${call}`
/** Ledger ref of the translations of a project's insights (research R9). */
export const insightTranslationRef = (projectId: string) => `insights-translation:${projectId}`

export const isRunLive = (run: InsightRun | null, now: Date): run is InsightRun =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/** A stale run ends as interrupted; the calls it merged stay. */
export const interruptedRun = (run: InsightRun, now: Date): InsightRun => ({
  ...run,
  failure: run.failure ?? 'INTERRUPTED',
  finishedAt: now,
})
