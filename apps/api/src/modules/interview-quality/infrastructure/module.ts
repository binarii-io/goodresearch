import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeRemarkCommands } from '../application/commands/remark-commands.ts'
import { makeReviewCommands } from '../application/commands/review-commands.ts'
import type { QualityAi, QualityDeps, QualitySources } from '../application/ports.ts'
import { makeQualityQueries, runRefs } from '../application/queries/quality-queries.ts'
import { isReviewLive } from '../domain/review-run.ts'
import type { QualityHandlers } from './http.routes.ts'
import { createQualityStore } from './quality.drizzle-store.ts'

const ReviewJobPayload = z.object({
  runId: z.string().min(1),
  studyId: z.string().min(1),
  anyway: z.boolean().default(false),
})

/** Builds the interview quality module: how the interviews were conducted (spec 016). */
export const createInterviewQualityModule = (deps: {
  db: Db
  clock: Clock
  /** The other modules, as the Quality tab reads them (research R1). */
  sources: QualitySources
  ai: QualityAi
  enqueue: (queue: string, data: object, options?: { singletonKey?: string }) => Promise<boolean>
  log?: { warn(object: object, message: string): void }
}) => {
  const store = createQualityStore(deps.db)
  const quality: QualityDeps = {
    store,
    sources: deps.sources,
    ai: deps.ai,
    clock: deps.clock,
    // One review per study at a time (FR-013).
    enqueueRun: (job) => deps.enqueue(QUEUES.review, job, { singletonKey: job.studyId }),
    log: deps.log ?? console,
  }
  const review = makeReviewCommands(quality)
  const handlers: QualityHandlers = {
    review,
    remarks: makeRemarkCommands(quality),
    queries: makeQualityQueries(quality),
  }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.review,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = ReviewJobPayload.safeParse(data)
        if (!job.success)
          return quality.log.warn({ issues: job.error.issues }, 'invalid review job ignored')
        return review.runJob(job.data)
      },
    },
  ]
  /** A review of the study is running: the other runs of the study wait (FR-013). */
  const qualityLive = async (studyId: string) =>
    isReviewLive(await store.openRun(studyId), deps.clock.now())
  /** Spec 017: the ledger refs of a study's reviews. */
  const studyCostRefs = async (studyId: string) => (await store.runsOf(studyId)).flatMap(runRefs)
  return { handlers, jobs, qualityLive, studyCostRefs }
}
