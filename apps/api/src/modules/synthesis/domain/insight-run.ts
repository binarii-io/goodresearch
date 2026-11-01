/** A run with no heartbeat for this long has stopped (worker gone). */
export const RUN_STALE_MS = 10 * 60_000

export type InsightsFailure =
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'
  | 'INTERRUPTED'
  | 'NO_FACTS'
  | 'NO_INSIGHTS'

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

/** "Find recommendations" over a project (spec 014): the same run, without studies or scope. */
export type RecommendationRun = Omit<InsightRun, 'studyIds' | 'scope'>

/** Ledger refs of spec 014 (research R6). */
export const recommendationsRef = (runId: string, call: number) =>
  `recommendations:${runId}:${call}`
export const takeawaysRef = (projectId: string) => `takeaways:${projectId}`
/** Translations of the takeaways, counted apart from the drafts (review of PR #14). */
export const takeawaysTranslationRef = (projectId: string) => `takeaways-translation:${projectId}`
export const recommendationTranslationRef = (projectId: string) =>
  `recommendations-translation:${projectId}`

/** Ledger ref of one call of a run (research R10). */
export const insightsRef = (runId: string, call: number) => `insights:${runId}:${call}`
/** Ledger ref of the translations of a project's insights (research R9). */
export const insightTranslationRef = (projectId: string) => `insights-translation:${projectId}`

/** The ledger refs of a run's calls. */
export const insightRunRefs = (run: { readonly id: string; readonly calls: number }) =>
  Array.from({ length: run.calls }, (_, n) => insightsRef(run.id, n + 1))
export const recommendationRunRefs = (run: { readonly id: string; readonly calls: number }) =>
  Array.from({ length: run.calls }, (_, n) => recommendationsRef(run.id, n + 1))

type Beating = { readonly finishedAt: Date | null; readonly heartbeatAt: Date }

export const isRunLive = <R extends Beating>(run: R | null, now: Date): run is R =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/** A stale run ends as interrupted; the calls it merged stay. */
export const interruptedRun = <R extends Beating & { readonly failure: InsightsFailure | null }>(
  run: R,
  now: Date,
): R => ({
  ...run,
  failure: run.failure ?? 'INTERRUPTED',
  finishedAt: now,
})
