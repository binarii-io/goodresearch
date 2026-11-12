import { type Clock, newId } from '@goodresearch/shared'
import { z } from 'zod'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import {
  backfillFacts,
  makeAnalysisRun,
  recoverStaleRuns,
  sweep,
} from '../application/commands/analysis-run.ts'
import { makeObservationCommands } from '../application/commands/observation-commands.ts'
import type {
  AnalysisAi,
  Facts,
  MediaTools,
  ProtocolOfSession,
  Screens,
  Sessions,
  Staging,
  UsabilityDeps,
} from '../application/ports.ts'
import { makeAnalysisQueries } from '../application/queries/analysis-queries.ts'
import { RUN_STALE_MS } from '../domain/analysis.ts'
import type { UsabilityHandlers } from './http.routes.ts'
import { createUsabilityStore } from './usability.drizzle-store.ts'

const JobPayload = z.object({
  runId: z.string().min(1),
  studyId: z.string().min(1),
  accountId: z.string().min(1),
})

/** The protocol content of a version, as Research stores it (spec 036). */
type ProtocolContent = {
  framing: { language: 'en' | 'fr' }
  scenario: string
  tasks: { id: string; instruction: string; criterion: string }[]
  questionnaire: string
  easeQuestion: string
}

const SWEEP_EVERY_MS = 60 * 60_000

/** The usability analysis (spec 038, ADR-0013): sessions read task by task from their video. */
export const createUsabilityModule = (deps: {
  db: Db
  clock: Clock
  sessions: () => Sessions
  protocolVersion: (studyId: string, version: number) => Promise<unknown | null>
  staging: Staging
  media: MediaTools
  ai: AnalysisAi
  screens: Screens
  facts: () => Facts
  enqueue: (queue: string, data: object, options: { singletonKey: string }) => Promise<boolean>
  log: UsabilityDeps['log']
}) => {
  const usability: UsabilityDeps = {
    store: createUsabilityStore(deps.db),
    // Late bound: Ingestion and Evidence are built after this module.
    sessions: new Proxy({} as Sessions, {
      get: (_t, key) => deps.sessions()[key as keyof Sessions],
    }),
    protocols: {
      version: async (studyId, version): Promise<ProtocolOfSession | null> => {
        const content = (await deps.protocolVersion(studyId, version)) as ProtocolContent | null
        return content
          ? {
              version,
              language: content.framing.language,
              scenario: content.scenario,
              tasks: content.tasks.map((t) => ({
                id: t.id,
                instruction: t.instruction,
                criterion: t.criterion,
              })),
              sus: content.questionnaire === 'sus-v1',
              ease: content.easeQuestion === 'seq-v1',
            }
          : null
      },
    },
    staging: deps.staging,
    media: deps.media,
    ai: deps.ai,
    screens: deps.screens,
    facts: new Proxy({} as Facts, { get: (_t, key) => deps.facts()[key as keyof Facts] }),
    enqueue: (job) => deps.enqueue(QUEUES.usabilityAnalysis, job, { singletonKey: job.studyId }),
    clock: deps.clock,
    newId,
    log: deps.log,
  }
  const run = makeAnalysisRun(usability)
  const handlers: UsabilityHandlers = {
    run,
    observations: makeObservationCommands(usability),
    queries: makeAnalysisQueries(usability, run),
    deps: usability,
  }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.usabilityAnalysis,
      handle: async (data) => {
        const job = JobPayload.safeParse(data)
        if (!job.success)
          return deps.log.warn({ issues: job.error.issues }, 'invalid usability job ignored')
        return run.runJob(job.data)
      },
    },
  ]
  /** The worker sweeps screenshots nothing refers to (deleted studies, sessions, analyses). */
  const startSweeping = () => {
    const once = async () => {
      // Runs left by a worker that stopped (a redeployment) are closed first.
      await recoverStaleRuns(usability).catch((error: unknown) =>
        deps.log.warn({ err: error }, 'stale runs not recovered'),
      )
      await sweep(usability).catch((error: unknown) =>
        deps.log.warn({ err: error }, 'screenshot sweep failed'),
      )
    }
    void once()
    // Spec 039: sessions analysed before their observations gave facts get them.
    void backfillFacts(usability).catch((error: unknown) =>
      deps.log.warn({ err: error }, 'facts backfill failed'),
    )
    // A run left by a quick restart is not stale yet at start: once more when it can be.
    const soon = setTimeout(once, RUN_STALE_MS + 60_000)
    soon.unref()
    const timer = setInterval(once, SWEEP_EVERY_MS)
    timer.unref()
    return () => {
      clearTimeout(soon)
      clearInterval(timer)
    }
  }
  return { handlers, jobs, startSweeping }
}
