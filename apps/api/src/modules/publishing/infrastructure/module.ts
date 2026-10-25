import type { Clock } from '@goodresearch/shared'
import { newId } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makePublicationCommands } from '../application/commands/publication-commands.ts'
import type { FilesPort, PreparationActions, PreparationReads } from '../application/ports.ts'
import { makePublicationQueries } from '../application/queries/publication-queries.ts'
import type { PublishingHandlers } from './http.routes.ts'
import { createPublishingStore } from './publishing.drizzle-store.ts'

/** Builds the publishing module (spec 007); Drive files and research data come through ports. */
export const createPublishingModule = (deps: {
  db: Db
  clock: Clock
  files: FilesPort
  reads: PreparationReads
  actions: PreparationActions
}) => {
  const publishing = {
    store: createPublishingStore(deps.db),
    files: deps.files,
    reads: deps.reads,
    actions: deps.actions,
    clock: deps.clock,
    newId,
  }
  const handlers: PublishingHandlers = {
    commands: makePublicationCommands(publishing),
    queries: makePublicationQueries(publishing),
  }
  return { handlers }
}
