import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result, safeReturnPath } from '@goodresearch/shared'
import {
  DriveConnectionLost,
  type DriveItem,
  DriveScopeMissing,
  FOLDER_MIME,
  type GrantProblem,
} from '../../domain/drive-gateway.ts'
import { parseDriveFolderLink } from '../../domain/drive-link.ts'
import { isActiveRun } from '../../domain/inventory-run.ts'
import { resolveStudyAccess } from '../access.ts'
import { readRefreshToken } from '../connection.ts'
import type { Actor, IngestionDeps, OauthState, StudySource } from '../ports.ts'

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
  | 'FOLDER_ALREADY_ATTACHED'
  | 'VALIDATION'

/** Spec 030 US4: what the session check found. */
export type GrantCheckResult =
  | { state: 'none' | 'ok' | 'unreachable' }
  | { state: 'problem'; grantProblem: GrantProblem }

/** Drive connection and study folder commands (spec 002 US2, US3). */
export const makeSourceCommands = (deps: IngestionDeps) => {
  const startConsent = async (c: {
    actor: { id: string }
    returnTo: string
    access: 'read' | 'write'
    mode: OauthState['mode']
    popup: boolean
    loginHint: string
  }): Promise<Result<{ url: string }, SourceError>> => {
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
        access: c.access,
        mode: c.mode,
        popup: c.popup,
        expiresAt: new Date(now.getTime() + STATE_TTL_MS),
      },
      now,
    )
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    return ok({
      url: deps.drive.authorization.authorizationUrl({
        state,
        codeChallenge,
        loginHint: c.loginHint,
        access: c.access,
      }),
    })
  }

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

  /** The folder behind a link, opened with the person's own permission. */
  const readFolder = async (
    actor: Actor,
    studyId: string,
    link: string,
    onlyIfNone: boolean,
  ): Promise<Result<DriveItem, SourceError>> => {
    const access = await resolveStudyAccess(deps, actor.id, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (access.kind === 'drive-not-connected' && onlyIfNone) return err('FOLDER_ALREADY_ATTACHED')
    if (access.kind === 'no-folder-access') return err('FOLDER_ACCESS_REQUIRED')
    if (access.kind === 'drive-unavailable') return err('DRIVE_UNAVAILABLE')
    if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
    if (onlyIfNone && access.source) return err('FOLDER_ALREADY_ATTACHED')
    const folderId = parseDriveFolderLink(link)
    if (!folderId.ok) return folderId
    const refreshToken = await readRefreshToken(deps, await deps.store.getConnection(actor.id))
    if (!refreshToken) return err('DRIVE_NOT_CONNECTED')
    if (access.source && isActiveRun(access.source.inventory, deps.clock.now()))
      return err('INVENTORY_RUNNING')
    let folder: DriveItem | null
    try {
      folder = await deps.drive.gateway.getItem(refreshToken, folderId.value)
    } catch (error) {
      if (!(error instanceof DriveConnectionLost)) throw error
      await deps.store.markConnectionLost(actor.id, error.reason)
      return err('DRIVE_NOT_CONNECTED')
    }
    if (!folder || folder.trashed) return err('FOLDER_NOT_FOUND')
    if (folder.mimeType !== FOLDER_MIME) return err('NOT_A_DRIVE_FOLDER_LINK')
    return ok(folder)
  }

  /** Spec 030 US4: a token from the saved Drive grant, nothing else. */
  const checkDriveGrantOf = async (accountId: string): Promise<GrantCheckResult> => {
    const current = await deps.store.getConnection(accountId)
    if (!deps.drive || !current) return { state: 'none' }
    const refreshToken = await readRefreshToken(deps, { ...current, status: 'connected' })
    if (!refreshToken) return { state: 'problem', grantProblem: 'unreadable' }
    try {
      const answer = await deps.drive.gateway.checkGrant(refreshToken)
      if (answer === 'unreachable') return { state: 'unreachable' }
    } catch (error) {
      if (!(error instanceof DriveConnectionLost)) return { state: 'unreachable' }
      await deps.store.markConnectionLost(accountId, error.reason)
      return { state: 'problem', grantProblem: error.reason }
    }
    // The grant works again (e.g. the organisation's sign-in was done elsewhere).
    if (current.status === 'lost')
      await deps.store.saveConnection({ ...current, status: 'connected', lostReason: null })
    return { state: 'ok' }
  }

  return {
    /** FR-007: the consent is asked only when needed, after the explanation shown by the app. */
    startDriveConnection: async (c: {
      actor: { id: string }
      returnTo: string
      /** `write` when publishing needs it (spec 007); `read` otherwise. */
      access?: 'read' | 'write'
    }): Promise<Result<{ url: string }, SourceError>> =>
      startConsent({
        actor: c.actor,
        returnTo: c.returnTo,
        access: c.access ?? 'read',
        mode: 'setup',
        popup: false,
        loginHint: '',
      }),

    /**
     * Spec 030 US3: Google on the saved account, for the same access; the callback accepts only
     * that account.
     */
    startDriveReconnect: async (c: {
      actor: { id: string }
      returnTo: string
      popup: boolean
    }): Promise<Result<{ url: string }, SourceError>> => {
      if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
      const current = await deps.store.getConnection(c.actor.id)
      if (!current) return err('DRIVE_NOT_CONNECTED')
      return startConsent({
        actor: c.actor,
        returnTo: c.returnTo,
        access: current.access,
        mode: 'reconnect',
        popup: c.popup,
        loginHint: current.externalAccount,
      })
    },

    /** Google came back without a consent (cancelled, error): where the person goes back. */
    abandonDriveConnection: async (c: {
      actor: { id: string }
      state: string
    }): Promise<
      Result<{ returnTo: string; mode: OauthState['mode']; popup: boolean }, SourceError>
    > => {
      const saved = await deps.store.takeOauthState(c.state, deps.clock.now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      return ok({ returnTo: saved.returnTo, mode: saved.mode, popup: saved.popup })
    },

    /**
     * The state is single-use, expires after 10 minutes and must belong to the signed-in person.
     * Reconnect (spec 030): only the saved Google account; the folder access checks are kept.
     */
    completeDriveConnection: async (c: {
      actor: { id: string }
      state: string
      code: string
    }): Promise<
      Result<
        {
          returnTo: string
          mode: OauthState['mode']
          popup: boolean
          result?: 'reconnected' | 'other-account' | 'missing-right' | 'error'
        },
        SourceError
      >
    > => {
      if (!deps.drive) return err('DRIVE_NOT_CONFIGURED')
      const saved = await deps.store.takeOauthState(c.state, deps.clock.now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      const back = { returnTo: saved.returnTo, mode: saved.mode, popup: saved.popup }
      let granted: Awaited<ReturnType<NonNullable<typeof deps.drive>['authorization']['exchange']>>
      try {
        granted = await deps.drive.authorization.exchange({
          code: c.code,
          codeVerifier: saved.codeVerifier,
          access: saved.access,
        })
      } catch (error) {
        if (saved.mode === 'setup') throw error
        if (error instanceof DriveScopeMissing) return ok({ ...back, result: 'missing-right' })
        // The pop-up must still end on its landing page, so the page that opened it hears back.
        deps.log.warn({ err: error }, 'Drive reconnection exchange failed')
        return ok({ ...back, result: 'error' })
      }
      const current = await deps.store.getConnection(c.actor.id)
      if (saved.mode === 'reconnect' && current?.externalAccount !== granted.externalAccount)
        return ok({ ...back, result: 'other-account' })
      await deps.store.saveConnection({
        accountId: c.actor.id,
        connector: 'google-drive',
        externalAccount: granted.externalAccount,
        encryptedRefreshToken: deps.cipher.encrypt(granted.refreshToken, c.actor.id),
        status: 'connected',
        connectedAt: deps.clock.now(),
        access: granted.access,
        lostReason: null,
      })
      if (saved.mode === 'reconnect') return ok({ ...back, result: 'reconnected' })
      await deps.store.clearFolderAccessOf(c.actor.id)
      return ok(back)
    },

    /**
     * Spec 030 US4: once per browser session, a token is asked from the saved grant. A refusal
     * marks the connection lost with its reason; Google not answering changes nothing.
     */
    checkDriveGrant: async (c: {
      actor: { id: string }
    }): Promise<Result<GrantCheckResult, never>> => ok(await checkDriveGrantOf(c.actor.id)),

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

    /** Spec 022: what attaching this link would find; nothing is attached and nothing started. */
    checkFolder: async (c: {
      actor: Actor
      studyId: string
      link: string
    }): Promise<Result<{ folderName: string; folderOwner: string | null }, SourceError>> => {
      const read = await readFolder(c.actor, c.studyId, c.link, true)
      return read.ok
        ? ok({ folderName: read.value.name, folderOwner: read.value.ownerName ?? null })
        : read
    },

    attachFolder: async (c: {
      actor: Actor
      studyId: string
      link: string
      /** Spec 022: replacing discards interviews, which only the form states. */
      onlyIfNone?: boolean
    }): Promise<Result<void, SourceError>> => {
      const read = await readFolder(c.actor, c.studyId, c.link, c.onlyIfNone ?? false)
      if (!read.ok) return read
      const folder = read.value
      const now = deps.clock.now()
      const source: StudySource = {
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
      }
      if (c.onlyIfNone) {
        if (!(await deps.store.attachNewSource(source))) return err('FOLDER_ALREADY_ATTACHED')
      } else await deps.store.attachSource(source)
      await deps.store.saveFolderAccess(c.studyId, c.actor.id, 'granted', now)
      const started = await startInventory(c.studyId, c.actor.id)
      // Spec 022: the folder is attached; an inventory that did not start can be run from Fieldwork.
      return c.onlyIfNone ? ok(undefined) : started
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
