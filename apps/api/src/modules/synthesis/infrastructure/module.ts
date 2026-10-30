import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeDebriefCommands } from '../application/commands/debrief-commands.ts'
import { makeInsightCommands } from '../application/commands/insight-commands.ts'
import { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import { makeRecommendationCommands } from '../application/commands/recommendation-commands.ts'
import { makeRecommendationRunCommands } from '../application/commands/recommendation-run-commands.ts'
import { makeTakeawaysCommands } from '../application/commands/takeaways-commands.ts'
import type { InsightsAi, SynthesisDeps, SynthesisSources } from '../application/ports.ts'
import { makeDebriefQueries } from '../application/queries/debrief-queries.ts'
import { makeInsightQueries } from '../application/queries/insight-queries.ts'
import { makeRecommendationQueries } from '../application/queries/recommendation-queries.ts'
import type { SynthesisHandlers } from './http.routes.ts'
import { createSynthesisStore } from './synthesis.drizzle-store.ts'

const InsightsJobPayload = z.object({ runId: z.string().min(1), projectId: z.string().min(1) })
export const TranslateJobPayload = z.object({
  insightId: z.string().min(1),
  accountId: z.string().min(1),
  from: z.enum(['en', 'fr']),
  /** Jobs queued before spec 014 have none: an insight. */
  target: z.enum(['insight', 'recommendation', 'takeaways']).optional(),
  // Only the fields written: a record keyed by an enum would require every key (zod 4).
  texts: z.partialRecord(
    z.enum([
      'statement',
      'description',
      'counterEvidence',
      'minorityView',
      'action',
      'rationale',
      'successMeasure',
      'text',
    ]),
    z.string().max(1200),
  ),
})
const TakeawaysJobPayload = z.object({
  projectId: z.string().min(1),
  accountId: z.string().min(1),
  withProposed: z.boolean().optional(),
})

/** Builds the synthesis module: insights (spec 013), recommendations (014), the debrief (015). */
export const createSynthesisModule = (deps: {
  db: Db
  clock: Clock
  /** The other modules, as Synthesis reads them (research R1). */
  sources: SynthesisSources
  ai: InsightsAi
  enqueue: (queue: string, data: object, options?: { singletonKey?: string }) => Promise<boolean>
  log?: { warn(object: object, message: string): void }
}) => {
  const synthesis: SynthesisDeps = {
    store: createSynthesisStore(deps.db),
    sources: deps.sources,
    ai: deps.ai,
    clock: deps.clock,
    // One run per project at a time (FR-015).
    enqueueRun: (job) => deps.enqueue(QUEUES.insights, job, { singletonKey: job.projectId }),
    enqueueTranslation: (job) => deps.enqueue(QUEUES.insightTranslate, job),
    // Spec 014: one recommendations run and one takeaways draft per project at a time.
    enqueueRecommendations: (job) =>
      deps.enqueue(QUEUES.recommendations, job, { singletonKey: job.projectId }),
    enqueueTakeaways: (job) => deps.enqueue(QUEUES.takeaways, job, { singletonKey: job.projectId }),
    log: deps.log ?? console,
  }
  const runs = makeInsightRunCommands(synthesis)
  const insights = makeInsightCommands(synthesis)
  const recommendationRuns = makeRecommendationRunCommands(synthesis)
  const recommendations = makeRecommendationCommands(synthesis)
  const takeaways = makeTakeawaysCommands(synthesis)
  const debrief = makeDebriefCommands(synthesis)
  const handlers: SynthesisHandlers = {
    runs,
    insights,
    queries: makeInsightQueries(synthesis),
    recommendationRuns,
    recommendations,
    takeaways,
    recommendationQueries: makeRecommendationQueries(synthesis),
    debrief,
    debriefQueries: makeDebriefQueries(synthesis),
  }
  const parsed = <T>(schema: z.ZodType<T>, data: unknown, what: string): T | null => {
    // Job payloads cross a process boundary: validate them (AGENTS.md).
    const job = schema.safeParse(data)
    if (job.success) return job.data
    synthesis.log.warn({ issues: job.error.issues }, `invalid ${what} job ignored`)
    return null
  }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.insights,
      handle: async (data) => {
        const job = parsed(InsightsJobPayload, data, 'insights')
        if (job) await runs.runJob(job)
      },
    },
    {
      queue: QUEUES.insightTranslate,
      handle: async (data) => {
        const job = parsed(TranslateJobPayload, data, 'translation')
        if (!job) return
        const texts = Object.fromEntries(
          Object.entries(job.texts).filter((e): e is [string, string] => e[1] !== undefined),
        )
        const translation = { ...job, texts }
        if (job.target === 'recommendation') return recommendations.translateJob(translation)
        if (job.target === 'takeaways') return takeaways.translateJob(translation)
        return insights.translateJob(translation)
      },
    },
    {
      queue: QUEUES.recommendations,
      handle: async (data) => {
        const job = parsed(InsightsJobPayload, data, 'recommendations')
        if (job) await recommendationRuns.runJob(job)
      },
    },
    {
      queue: QUEUES.takeaways,
      handle: async (data) => {
        const job = parsed(TakeawaysJobPayload, data, 'takeaways')
        if (job) await takeaways.draftJob(job)
      },
    },
  ]
  return { handlers, jobs }
}
