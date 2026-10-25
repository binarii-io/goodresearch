import { GOOGLE_DOC_MIME, hasTranscriptTab } from '../../domain/classify.ts'
import {
  DriveAccessDenied,
  DriveConnectionLost,
  DriveIncompleteListing,
  FOLDER_MIME,
} from '../../domain/drive-gateway.ts'
import { type InventoryFile, walkInventory } from '../../domain/inventory-walk.ts'
import { readRefreshToken } from '../connection.ts'
import type { IngestionDeps, InventoryFailure, InventoryJob } from '../ports.ts'

/**
 * Background inventory (FR-012 to FR-016), run by the worker with the requester's own Drive
 * permission. Every exit records a final state; every write is tied to this run and this folder,
 * so a replaced or detached folder never receives files of another one.
 */
const TAB_CHECKS_AT_ONCE = 5

const checkDocumentTabs = async (
  files: readonly InventoryFile[],
  tabsOf: (id: string) => Promise<readonly string[] | null>,
): Promise<InventoryFile[]> => {
  const docs = files.filter((f) => f.kind === 'transcript' && f.mimeType === GOOGLE_DOC_MIME)
  const notInterviews = new Set<string>()
  for (let i = 0; i < docs.length; i += TAB_CHECKS_AT_ONCE)
    await Promise.all(
      docs.slice(i, i + TAB_CHECKS_AT_ONCE).map(async (doc) => {
        const tabs = await tabsOf(doc.id).catch((error: unknown) => {
          if (error instanceof DriveConnectionLost) throw error
          return null
        })
        if (tabs !== null && !hasTranscriptTab(tabs)) notInterviews.add(doc.id)
      }),
    )
  return files.map((f) => (notInterviews.has(f.id) ? { ...f, kind: 'other' } : f))
}

export const makeRunInventory =
  (deps: IngestionDeps) =>
  async (job: InventoryJob): Promise<void> => {
    const run = { studyId: job.studyId, folderId: job.folderId, runId: job.runId }
    const fail = (failure: InventoryFailure) =>
      deps.store.failInventory(run, failure, deps.clock.now())
    let progressWrite: Promise<void> = Promise.resolve()
    try {
      const refreshToken = deps.drive
        ? await readRefreshToken(deps, await deps.store.getConnection(job.accountId))
        : null
      if (!deps.drive || !refreshToken) return await fail('ACCESS_LOST')
      const { gateway } = deps.drive
      const root = await gateway.getItem(refreshToken, job.folderId)
      if (!root || root.trashed || root.mimeType !== FOLDER_MIME)
        return await fail('FOLDER_NOT_FOUND')

      let lastWrite = 0
      const result = await walkInventory(
        job.folderId,
        {
          listChildren: (parentIds) => gateway.listChildren(refreshToken, parentIds, root.driveId),
          getItem: (id) => gateway.getItem(refreshToken, id),
        },
        (progress) => {
          // At most one progress write per second, in order, never failing the run (SC-004).
          const now = Date.now()
          if (now - lastWrite < 1000) return
          lastWrite = now
          progressWrite = progressWrite
            .then(() => deps.store.updateProgress(run, progress))
            .catch((error: unknown) =>
              deps.log.warn({ err: error, studyId: job.studyId }, 'inventory progress not saved'),
            )
        },
      )
      await progressWrite
      const study = await deps.studies.getStudyAccess(job.accountId, job.studyId)
      // Spec 008: a document whose tabs hold no transcript (meeting notes alone) is not an
      // interview file. Only tab titles are read; a document that cannot be read stays a transcript.
      const files = await checkDocumentTabs(result.files, (id) =>
        gateway.documentTabs(refreshToken, id),
      )
      await deps.store.completeInventory(
        run,
        files,
        { name: root.name, ownerName: root.ownerName ?? null },
        deps.clock.now(),
        { sessions: study?.type === 'interviews' },
      )
    } catch (error) {
      await progressWrite
      if (error instanceof DriveConnectionLost) {
        await deps.store.markConnectionLost(job.accountId)
        return fail('ACCESS_LOST')
      }
      if (error instanceof DriveAccessDenied) return fail('FOLDER_NOT_FOUND')
      if (error instanceof DriveIncompleteListing) return fail('INCOMPLETE')
      deps.log.error({ err: error, studyId: job.studyId }, 'inventory failed')
      return fail('DRIVE_ERROR')
    }
  }
