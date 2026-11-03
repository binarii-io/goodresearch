import type { Clock } from '@goodresearch/shared'
import { newId } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makePublicationCommands } from '../application/commands/publication-commands.ts'
import type {
  FilesPort,
  PreparationActions,
  PreparationReads,
  PublishingDeps,
} from '../application/ports.ts'
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
  responses: PublishingDeps['responses']
}) => {
  const publishing = {
    store: createPublishingStore(deps.db),
    files: deps.files,
    reads: deps.reads,
    actions: deps.actions,
    responses: deps.responses,
    clock: deps.clock,
    newId,
  }
  const handlers: PublishingHandlers = {
    commands: makePublicationCommands(publishing),
    queries: makePublicationQueries(publishing),
  }
  return {
    handlers,
    /** Spec 026: the study owning a publication. */
    /** Spec 028: the study's published form. */
    formOfStudy: async (studyId: string) => {
      const form = (await publishing.store.listByStudy(studyId)).find(
        (p) => p.kind === 'questionnaire' && p.fileId !== '',
      )
      return form
        ? {
            fileId: form.fileId,
            itemMap: form.itemMap,
            id: form.id,
            accepting: form.acceptingResponses,
          }
        : null
    },
    studyOfPublication: async (id: string) => (await publishing.store.get(id))?.studyId ?? null,
  }
}
