import {
  DriveAccessDenied,
  DriveConnectionLost,
  DriveIncompleteListing,
  FOLDER_MIME,
} from '../../domain/drive-gateway.ts'
import { walkInventory } from '../../domain/inventory-walk.ts'
import { readRefreshToken } from '../connection.ts'
import type { IngestionDeps, InventoryFailure, InventoryJob } from '../ports.ts'

/**
 * Background inventory (FR-012 to FR-016), run by the worker with the requester's own Drive
 * permission. Every exit records a final state; every write is tied to this run and this folder,
 * so a replaced or detached folder never receives files of another one.
 */
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
      await deps.store.completeInventory(
        run,
        result.files,
        { name: root.name, ownerName: root.ownerName ?? null },
        deps.clock.now(),
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
