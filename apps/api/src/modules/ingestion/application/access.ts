import { DriveConnectionLost } from '../domain/drive-gateway.ts'
import { folderAccessDecision } from '../domain/folder-access.ts'
import { readRefreshToken } from './connection.ts'
import type { IngestionDeps, StudySource } from './ports.ts'

export type StudyAccess =
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'full'
      readonly role: 'admin' | 'member'
      readonly type: string
      readonly source: StudySource | null
    }
  | {
      readonly kind: 'drive-not-connected' | 'no-folder-access' | 'drive-unavailable'
      readonly role: 'admin' | 'member'
      readonly type: string
      readonly source: StudySource
    }

/**
 * Spec 002 FR-010a: the project's team first, then — if the study has a folder — the person's own
 * access to it in Drive, checked with their own permission and reused for 5 minutes. A Drive outage
 * is reported as such and never cached.
 */
export const resolveStudyAccess = async (
  deps: IngestionDeps,
  accountId: string,
  studyId: string,
): Promise<StudyAccess> => {
  const visible = await deps.studies.getStudyAccess(accountId, studyId)
  if (!visible) return { kind: 'not-found' }
  const source = await deps.store.getSource(studyId)
  if (!source) return { kind: 'full', role: visible.role, type: visible.type, source: null }

  const refreshToken = deps.drive
    ? await readRefreshToken(deps, await deps.store.getConnection(accountId))
    : null
  if (!deps.drive || !refreshToken)
    return { kind: 'drive-not-connected', role: visible.role, type: visible.type, source }

  const now = deps.clock.now()
  const decision = folderAccessDecision({
    cached: await deps.store.getFolderAccess(studyId, accountId),
    now,
  })
  let result = decision.use
  if (result === 'check') {
    try {
      const folder = await deps.drive.gateway.getItem(refreshToken, source.folderId)
      result = folder && !folder.trashed ? 'granted' : 'denied'
    } catch (error) {
      if (error instanceof DriveConnectionLost) {
        await deps.store.markConnectionLost(accountId)
        return { kind: 'drive-not-connected', role: visible.role, type: visible.type, source }
      }
      deps.log.warn({ err: error, studyId }, 'Drive access check failed')
      return { kind: 'drive-unavailable', role: visible.role, type: visible.type, source }
    }
    await deps.store.saveFolderAccess(studyId, accountId, result, now)
  }
  return result === 'granted'
    ? { kind: 'full', role: visible.role, type: visible.type, source }
    : { kind: 'no-folder-access', role: visible.role, type: visible.type, source }
}
