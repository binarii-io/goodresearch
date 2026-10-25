import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result, safeReturnPath } from '@goodresearch/shared'
import { DriveConnectionLost, FOLDER_MIME } from '../../domain/drive-gateway.ts'
import { parseDriveFolderLink } from '../../domain/drive-link.ts'
import { isActiveRun } from '../../domain/inventory-run.ts'
import { resolveStudyAccess } from '../access.ts'
import { readRefreshToken } from '../connection.ts'
import type { Actor, IngestionDeps } from '../ports.ts'

const STATE_TTL_MS = 10 * 60 * 1000

export type SourceError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NOT_A_DRIVE_FOLDER_LINK'
  | 'FOLDER_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_UNAVAILABLE'
  | 'INVENTORY_RUNNING'
  | 'VALIDATION'

/** Drive connection and study folder commands (spec 002 US2, US3). */
export const makeSourceCommands = (deps: IngestionDeps) => {
  /** Starts a run and enqueues its job; a refused enqueue ends the run instead of leaving it running. */
  const startInventory = async (
    studyId: string,
    accountId: string,
  ): Promise<Result<void, SourceError>> => {
    const run = await deps.store.startInventory(studyId, accountId, deps.clock.now())
    if (!run) return err('INVENTORY_RUNNING')
    if (!(await deps.enqueueInventory({ ...run, accountId }))) {
      await deps.store.failInventory(run, 'NOT_STARTED', deps.clock.now())
      return err('INVENTORY_RUNNING')
    }
    return ok(undefined)
  }

  return {
    /** FR-007: the consent is asked only when needed, after the explanation shown by the app. */
    startDriveConnection: async (c: {
      actor: { id: string }
      returnTo: string
      /** `write` when publishing needs it (spec 007); `read` otherwise. */
      access?: 'read' | 'write'
    }): Promise<Result<{ url: string }, SourceError>> => {
      const access = c.access ?? 'read'
      if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
      const state = randomBytes(24).toString('base64url')
      const codeVerifier = randomBytes(48).toString('base64url')
      const now = deps.clock.now()
      await deps.store.saveOauthState(
        {
          state,
          accountId: c.actor.id,
          codeVerifier,
          returnTo: safeReturnPath(c.returnTo),
          access,
          expiresAt: new Date(now.getTime() + STATE_TTL_MS),
        },
        now,
      )
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      return ok({
        url: deps.drive.authorization.authorizationUrl({
          state,
          codeChallenge,
          loginHint: '',
          access,
        }),
      })
    },

    /** The state is single-use, expires after 10 minutes and must belong to the signed-in person. */
    completeDriveConnection: async (c: {
      actor: { id: string }
      state: string
      code: string
    }): Promise<Result<{ returnTo: string }, SourceError>> => {
      if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
      const saved = await deps.store.takeOauthState(c.state, deps.clock.now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      const granted = await deps.drive.authorization.exchange({
        code: c.code,
        codeVerifier: saved.codeVerifier,
        access: saved.access,
      })
      await deps.store.saveConnection({
        accountId: c.actor.id,
        connector: 'google-drive',
        externalAccount: granted.externalAccount,
        encryptedRefreshToken: deps.cipher.encrypt(granted.refreshToken, c.actor.id),
        status: 'connected',
        connectedAt: deps.clock.now(),
        access: granted.access,
      })
      await deps.store.clearFolderAccessOf(c.actor.id)
      return ok({ returnTo: saved.returnTo })
    },

    /** FR-009: revokes at Google, then forgets the permission and the access checks made with it. */
    disconnectDrive: async (c: { actor: { id: string } }): Promise<Result<void, never>> => {
      const connection = await deps.store.getConnection(c.actor.id)
      const refreshToken = connection
        ? await readRefreshToken(deps, { ...connection, status: 'connected' })
        : null
      if (refreshToken && deps.drive) {
        await deps.drive.authorization.revoke(refreshToken).catch((error: unknown) => {
          deps.log.warn(
            { err: error, accountId: c.actor.id },
            'Drive revocation failed; permission forgotten anyway',
          )
        })
      }
      await deps.store.deleteConnection(c.actor.id)
      await deps.store.clearFolderAccessOf(c.actor.id)
      return ok(undefined)
    },

    attachFolder: async (c: {
      actor: Actor
      studyId: string
      link: string
    }): Promise<Result<void, SourceError>> => {
      const access = await resolveStudyAccess(deps, c.actor.id, c.studyId)
      if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
      if (access.kind === 'no-folder-access') return err('FOLDER_ACCESS_REQUIRED')
      if (access.kind === 'drive-unavailable') return err('DRIVE_UNAVAILABLE')
      if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
      const folderId = parseDriveFolderLink(c.link)
      if (!folderId.ok) return folderId
      const refreshToken = await readRefreshToken(deps, await deps.store.getConnection(c.actor.id))
      if (!refreshToken) return err('DRIVE_NOT_CONNECTED')
      if (access.source && isActiveRun(access.source.inventory, deps.clock.now()))
        return err('INVENTORY_RUNNING')
      let folder: Awaited<ReturnType<typeof deps.drive.gateway.getItem>>
      try {
        folder = await deps.drive.gateway.getItem(refreshToken, folderId.value)
      } catch (error) {
        if (!(error instanceof DriveConnectionLost)) throw error
        await deps.store.markConnectionLost(c.actor.id)
        return err('DRIVE_NOT_CONNECTED')
      }
      if (!folder || folder.trashed) return err('FOLDER_NOT_FOUND')
      if (folder.mimeType !== FOLDER_MIME) return err('NOT_A_DRIVE_FOLDER_LINK')
      const now = deps.clock.now()
      await deps.store.attachSource({
        studyId: c.studyId,
        folderId: folder.id,
        folderName: folder.name,
        ownerName: folder.ownerName ?? null,
        webViewLink: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`,
        attachedBy: c.actor.id,
        attachedAt: now,
        inventory: {
          status: 'never',
          startedAt: null,
          finishedAt: null,
          runBy: null,
          progress: null,
          failure: null,
          lastSuccessAt: null,
        },
      })
      await deps.store.saveFolderAccess(c.studyId, c.actor.id, 'granted', now)
      return startInventory(c.studyId, c.actor.id)
    },

    /**
     * FR-011; admins may detach without folder access so a study is never stuck (FR-010b). A run in
     * progress is invalidated: its writes no longer match the study (see InventoryRun).
     */
    detachFolder: async (c: {
      actor: Actor
      studyId: string
    }): Promise<Result<void, SourceError>> => {
      const access = await resolveStudyAccess(deps, c.actor.id, c.studyId)
      if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
      if (access.kind !== 'full' && c.actor.role !== 'admin') return err('FOLDER_ACCESS_REQUIRED')
      await deps.store.deleteSource(c.studyId)
      return ok(undefined)
    },

    refreshInventory: async (c: {
      actor: Actor
      studyId: string
    }): Promise<Result<void, SourceError>> => {
      const access = await resolveStudyAccess(deps, c.actor.id, c.studyId)
      if (access.kind === 'not-found' || !access.source) return err('STUDY_NOT_FOUND')
      if (access.kind === 'drive-not-connected') return err('DRIVE_NOT_CONNECTED')
      if (access.kind === 'drive-unavailable') return err('DRIVE_UNAVAILABLE')
      if (access.kind === 'no-folder-access') return err('FOLDER_ACCESS_REQUIRED')
      return startInventory(c.studyId, c.actor.id)
    },
  }
}

export type SourceCommands = ReturnType<typeof makeSourceCommands>
