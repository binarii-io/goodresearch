import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeInsightCommands } from '../application/commands/insight-commands.ts'
import { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import type { InsightsAi, SynthesisDeps, SynthesisSources } from '../application/ports.ts'
import { makeInsightQueries } from '../application/queries/insight-queries.ts'
import type { SynthesisHandlers } from './http.routes.ts'
import { createSynthesisStore } from './synthesis.drizzle-store.ts'

const InsightsJobPayload = z.object({ runId: z.string().min(1), projectId: z.string().min(1) })
const Text = z.string().max(1000).optional()
const TranslateJobPayload = z.object({
  insightId: z.string().min(1),
  accountId: z.string().min(1),
  from: z.enum(['en', 'fr']),
  texts: z.object({
    statement: Text,
    description: Text,
    counterEvidence: Text,
    minorityView: Text,
  }),
})

/** Builds the synthesis module: the project's insights (spec 013). */
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
    log: deps.log ?? console,
  }
  const runs = makeInsightRunCommands(synthesis)
  const insights = makeInsightCommands(synthesis)
  const handlers: SynthesisHandlers = { runs, insights, queries: makeInsightQueries(synthesis) }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.insights,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = InsightsJobPayload.safeParse(data)
        if (!job.success)
          return synthesis.log.warn({ issues: job.error.issues }, 'invalid insights job ignored')
        return runs.runJob(job.data)
      },
    },
    {
      queue: QUEUES.insightTranslate,
      handle: async (data) => {
        const job = TranslateJobPayload.safeParse(data)
        if (!job.success)
          return synthesis.log.warn({ issues: job.error.issues }, 'invalid translation job ignored')
        const texts = Object.fromEntries(
          Object.entries(job.data.texts).filter((e): e is [string, string] => e[1] !== undefined),
        )
        return insights.translateJob({ ...job.data, texts })
      },
    },
  ]
  return { handlers, jobs }
}
