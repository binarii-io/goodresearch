import type { AppConfig } from '@goodresearch/config'
import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import type { Db } from '#platform/db.ts'
import type { JobHandler } from '#platform/jobs.ts'
import { QUEUES } from '#platform/jobs.ts'
import { makeAnalysisCommands } from '../application/commands/analysis-commands.ts'
import { makePlannedSync } from '../application/commands/planned-sync.ts'
import { makeRenameCommands } from '../application/commands/rename-commands.ts'
import { makeRunInventory } from '../application/commands/run-inventory.ts'
import { makeSessionCommands } from '../application/commands/session-commands.ts'
import { makeSourceCommands } from '../application/commands/source-commands.ts'
import { makeEnrichmentSources } from '../application/enrichment-sources.ts'
import type {
  Analyzer,
  IngestionDeps,
  Members,
  Schedule,
  StudyDirectory,
} from '../application/ports.ts'
import { makeSessionQueries } from '../application/queries/session-queries.ts'
import { makeSourceQueries, makeStudyActionGate } from '../application/queries/source-queries.ts'
import { makeStudyCostRefs, makeStudyOverview } from '../application/queries/study-overview.ts'
import { makeStudyFiles } from '../application/study-files.ts'
import type { DriveDocuments } from '../domain/drive-documents.ts'
import type { DriveAuthorization, DriveGateway } from '../domain/drive-gateway.ts'
import { createDevDrive } from './dev-drive.ts'
import { createDriveFetchGateway } from './drive.fetch-gateway.ts'
import { createGoogleDocuments } from './google-documents.ts'
import { createGoogleDriveAuthorization } from './google-oauth.ts'
import { createGoogleRequests } from './google-requests.ts'
import type { IngestionHandlers } from './http.routes.ts'
import { createIngestionStore } from './ingestion.drizzle-store.ts'

const InventoryJobPayload = z.object({
  studyId: z.string().min(1),
  folderId: z.string().min(1),
  runId: z.string().min(1),
  accountId: z.string().min(1),
})

const AnalysisJobPayload = z.object({ runId: z.string().min(1), studyId: z.string().min(1) })

/** Google Drive with one set of access tokens per person for reading and for documents. */
const googleDrive = (google: { clientId: string; clientSecret: string }, appUrl: URL) => {
  const requests = createGoogleRequests(google)
  return {
    gateway: createDriveFetchGateway({ ...google, requests }),
    authorization: createGoogleDriveAuthorization({ ...google, appUrl }),
    documents: createGoogleDocuments({ ...google, requests }),
  }
}

/** Builds the ingestion module (spec 002). `drive` can be replaced by a fake in tests. */
export const createIngestionModule = (deps: {
  db: Db
  clock: Clock
  config: Pick<AppConfig, 'appUrl' | 'authSecret' | 'google' | 'driveFake'>
  studies: StudyDirectory
  /** The study's schedule (research module), for link suggestions (spec 008). */
  schedule: Schedule
  members: Members
  /** The AI of the analyses, through the AI Gateway (spec 009). */
  analyzer: Analyzer
  enqueue: (queue: string, data: object, options: { singletonKey: string }) => Promise<boolean>
  drive?: {
    gateway: DriveGateway
    authorization: DriveAuthorization
    /** Writing and reading published files (spec 007). */
    documents?: DriveDocuments
  } | null
  log?: {
    warn(object: object, message: string): void
    error(object: object, message: string): void
  }
}) => {
  const { config } = deps
  const devDrive =
    deps.drive === undefined && config.driveFake ? createDevDrive(config.appUrl) : null
  const drive =
    deps.drive !== undefined
      ? deps.drive
      : devDrive
        ? devDrive
        : config.google
          ? googleDrive(config.google, config.appUrl)
          : null
  const ingestion: IngestionDeps = {
    store: createIngestionStore(deps.db),
    studies: deps.studies,
    schedule: deps.schedule,
    members: deps.members,
    drive,
    cipher: createTokenCipher(config.authSecret, CIPHER_PURPOSES.sourceConnections),
    // One job per run: an invalidated run still in flight never blocks the next one.
    enqueueInventory: (job) => deps.enqueue(QUEUES.inventory, job, { singletonKey: job.runId }),
    // One analysis run per study at a time (research R6).
    enqueueAnalysis: (job) => deps.enqueue(QUEUES.analysis, job, { singletonKey: job.studyId }),
    analyzer: deps.analyzer,
    clock: deps.clock,
    log: deps.log ?? console,
  }
  const runInventory = makeRunInventory(ingestion)
  const studyFiles = makeStudyFiles(ingestion, drive?.documents ?? null)
  const analysis = makeAnalysisCommands(ingestion)
  const handlers: IngestionHandlers = {
    analysis,
    rename: makeRenameCommands(ingestion, studyFiles),
    commands: makeSourceCommands(ingestion),
    queries: makeSourceQueries(ingestion),
    sessions: makeSessionCommands(ingestion),
    sessionQueries: makeSessionQueries(ingestion),
    ...(devDrive ? { devEdit: devDrive.edit } : {}),
  }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.inventory,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = InventoryJobPayload.safeParse(data)
        if (!job.success)
          return ingestion.log.warn({ issues: job.error.issues }, 'invalid inventory job ignored')
        return runInventory(job.data)
      },
    },
    {
      queue: QUEUES.analysis,
      handle: async (data) => {
        const job = AnalysisJobPayload.safeParse(data)
        if (!job.success)
          return ingestion.log.warn({ issues: job.error.issues }, 'invalid analysis job ignored')
        return analysis.runJob(job.data)
      },
    },
  ]

  return {
    handlers,
    jobs,
    runInventory,
    gate: makeStudyActionGate(ingestion),
    /** The files of a study's folder with one person's own access (spec 007). */
    studyFiles,
    sourceSummaries: ingestion.store.folderSummaries,
    /** Spec 017: a study's interviews for the project's Overview. */
    studyOverview: makeStudyOverview(ingestion),
    studyCostRefs: makeStudyCostRefs(ingestion),
    /** What the Enrichment phase reads from the validated interviews (spec 010). */
    enrichment: makeEnrichmentSources(ingestion),
    /** The research module tells when a planned interview changed (spec 009 FR-022). */
    plannedChanged: makePlannedSync(ingestion).plannedChanged,
  }
}
