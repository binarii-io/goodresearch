import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeAnalysisCommands } from '../application/commands/analysis-commands.ts'
import { makeFactCommands } from '../application/commands/fact-commands.ts'
import type { AnalysisSources, EvidenceDeps, FactsAi } from '../application/ports.ts'
import { makeAnalysisQueries } from '../application/queries/analysis-queries.ts'
import { makeSynthesisReads } from '../application/queries/synthesis-reads.ts'
import { isFactsRunLive } from '../domain/analysis-run.ts'
import { createEvidenceStore } from './evidence.drizzle-store.ts'
import type { EvidenceHandlers } from './http.routes.ts'

const FactsJobPayload = z.object({
  runId: z.string().min(1),
  studyId: z.string().min(1),
  all: z.boolean().default(false),
})
const TranslateJobPayload = z.object({
  factId: z.string().min(1),
  version: z.number().int(),
  accountId: z.string().min(1),
  from: z.enum(['en', 'fr']),
  text: z.string().max(1000).optional(),
})

/** Builds the evidence module: verbatims and facts of the interviews (spec 012). */
export const createEvidenceModule = (deps: {
  db: Db
  clock: Clock
  /** The other modules, as Analysis reads them (research R1). */
  sources: AnalysisSources
  ai: FactsAi
  enqueue: (queue: string, data: object, options?: { singletonKey?: string }) => Promise<boolean>
  log?: { warn(object: object, message: string): void }
}) => {
  const store = createEvidenceStore(deps.db)
  const evidence: EvidenceDeps = {
    store,
    sources: deps.sources,
    ai: deps.ai,
    clock: deps.clock,
    // One reading per study at a time (FR-012).
    enqueueRun: (job) => deps.enqueue(QUEUES.facts, job, { singletonKey: job.studyId }),
    enqueueTranslation: (job) => deps.enqueue(QUEUES.translate, job),
    log: deps.log ?? console,
  }
  const analysis = makeAnalysisCommands(evidence)
  const facts = makeFactCommands(evidence)
  const handlers: EvidenceHandlers = { analysis, facts, queries: makeAnalysisQueries(evidence) }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.facts,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = FactsJobPayload.safeParse(data)
        if (!job.success)
          return evidence.log.warn({ issues: job.error.issues }, 'invalid facts job ignored')
        return analysis.runJob(job.data)
      },
    },
    {
      queue: QUEUES.translate,
      handle: async (data) => {
        const job = TranslateJobPayload.safeParse(data)
        if (!job.success)
          return evidence.log.warn({ issues: job.error.issues }, 'invalid translation job ignored')
        return facts.translateJob(job.data)
      },
    },
  ]
  /** A "Find facts" of the study is running: the Enrichment runs wait (FR-012). */
  const factsLive = async (studyId: string) =>
    isFactsRunLive(await store.openRun(studyId), deps.clock.now())
  /** The facts the project's insights read (spec 013 research R1). */
  const reads = makeSynthesisReads(store)
  /** A person's attributions of an interview's speaker labels (spec 016 research R5). */
  const speakerAttributions = (sessionId: string) => store.speakersOf(sessionId)
  return { handlers, jobs, factsLive, reads, speakerAttributions }
}
