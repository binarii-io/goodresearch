import type { AppConfig } from '@goodresearch/config'
import type { Clock } from '@goodresearch/shared'
import { z } from 'zod'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import type { Db } from '#platform/db.ts'
import type { JobHandler } from '#platform/jobs.ts'
import { QUEUES } from '#platform/jobs.ts'
import { makeRunInventory } from '../application/commands/run-inventory.ts'
import { makeSourceCommands } from '../application/commands/source-commands.ts'
import type { IngestionDeps, StudyDirectory } from '../application/ports.ts'
import { makeSourceQueries, makeStudyActionGate } from '../application/queries/source-queries.ts'
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
    drive,
    cipher: createTokenCipher(config.authSecret, CIPHER_PURPOSES.sourceConnections),
    // One job per run: an invalidated run still in flight never blocks the next one.
    enqueueInventory: (job) => deps.enqueue(QUEUES.inventory, job, { singletonKey: job.runId }),
    clock: deps.clock,
    log: deps.log ?? console,
  }
  const runInventory = makeRunInventory(ingestion)
  const handlers: IngestionHandlers = {
    commands: makeSourceCommands(ingestion),
    queries: makeSourceQueries(ingestion),
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
  ]

  return {
    handlers,
    jobs,
    runInventory,
    gate: makeStudyActionGate(ingestion),
    /** The files of a study's folder with one person's own access (spec 007). */
    studyFiles: makeStudyFiles(ingestion, drive?.documents ?? null),
    sourceSummaries: ingestion.store.folderSummaries,
  }
}
