import type { Clock } from '@goodresearch/shared'
import type { FileKind } from '../domain/classify.ts'
import type { DriveAuthorization, DriveGateway } from '../domain/drive-gateway.ts'
import type { FolderAccessResult } from '../domain/folder-access.ts'
import type { InventoryRun } from '../domain/inventory-run.ts'
import type { InventoryFile, InventoryProgress } from '../domain/inventory-walk.ts'
import type { Session } from '../domain/session.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

/** Who may see a study at all (its project's team): implemented by the research module. */
export type StudyDirectory = {
  getStudyAccess(
    accountId: string,
    studyId: string,
  ): Promise<{ role: 'admin' | 'member'; type: string } | null>
}

/** A planned interview of a study's schedule (spec 006), as fieldwork needs it. */
export type PlannedSummary = {
  readonly id: string
  readonly interviewee: string
  readonly interviewers: string
  readonly scheduledAt: string | null
  readonly status: 'to-contact' | 'invited' | 'scheduled' | 'done' | 'postponed' | 'cancelled'
  readonly version: number
}

/**
 * The study's schedule, read with the person's own access (research module); `null` when it could
 * not be read, so a link is never dropped on a doubt (PR #8 review).
 */
export type Schedule = {
  list(accountId: string, studyId: string): Promise<readonly PlannedSummary[] | null>
}

/** Workspace members, for the interviewers of a session (spec 008 FR-008). */
export type Members = {
  exist(ids: readonly string[]): Promise<boolean>
}

/** Result of a conditional write of a session. */
export type SessionWrite = 'saved' | 'stale' | 'linked' | 'media-taken'

export type SourceConnection = {
  readonly accountId: string
  readonly connector: 'google-drive'
  readonly externalAccount: string
  readonly encryptedRefreshToken: string
  readonly status: 'connected' | 'lost'
  readonly connectedAt: Date
  /** `write` once the person granted editing (spec 007); reading needs `read` or more. */
  readonly access: DriveAccess
}

export type DriveAccess = 'read' | 'write'

export type InventoryFailure =
  | 'FOLDER_NOT_FOUND'
  | 'ACCESS_LOST'
  | 'INCOMPLETE'
  | 'DRIVE_ERROR'
  | 'NOT_STARTED'

export type InventoryState = {
  readonly status: 'never' | 'running' | 'done' | 'failed'
  readonly startedAt: Date | null
  readonly finishedAt: Date | null
  readonly runBy: string | null
  readonly progress: InventoryProgress | null
  readonly failure: InventoryFailure | null
  readonly lastSuccessAt: Date | null
}

export type StudySource = {
  readonly studyId: string
  readonly folderId: string
  readonly folderName: string
  readonly ownerName: string | null
  readonly webViewLink: string
  readonly attachedBy: string
  readonly attachedAt: Date
  readonly inventory: InventoryState
}

export type OauthState = {
  readonly state: string
  readonly accountId: string
  readonly codeVerifier: string
  readonly returnTo: string
  /** What the consent asks for. */
  readonly access: DriveAccess
  readonly expiresAt: Date
}

/** Persistence of the ingestion module (Drizzle in production, in memory in use-case tests). */
export interface IngestionStore {
  getConnection(accountId: string): Promise<SourceConnection | null>
  saveConnection(connection: SourceConnection): Promise<void>
  markConnectionLost(accountId: string): Promise<void>
  deleteConnection(accountId: string): Promise<void>
  /** Also purges expired states. */
  saveOauthState(state: OauthState, now: Date): Promise<void>
  /** Returns and deletes the state, or null if unknown or expired. */
  takeOauthState(state: string, now: Date): Promise<OauthState | null>
  getSource(studyId: string): Promise<StudySource | null>
  /** Attaches (or replaces) a folder: previous files, sessions, access checks and runs are discarded. */
  attachSource(source: StudySource): Promise<void>
  deleteSource(studyId: string): Promise<void>
  /** Starts a new run unless an active (non-stale) one exists; returns it, or null. */
  startInventory(studyId: string, runBy: string, now: Date): Promise<InventoryRun | null>
  /** The writes below apply only to the current run of the same folder (see InventoryRun). */
  updateProgress(run: InventoryRun, progress: InventoryProgress): Promise<void>
  /**
   * Replaces the files, reconciles the sessions (spec 008 FR-002) and marks the run done, atomically;
   * false when the run is no longer current.
   */
  completeInventory(
    run: InventoryRun,
    files: readonly InventoryFile[],
    folder: { name: string; ownerName: string | null },
    now: Date,
    /** Only interview studies have sessions. */
    options?: { sessions: boolean },
  ): Promise<boolean>
  failInventory(run: InventoryRun, failure: InventoryFailure, now: Date): Promise<void>
  getFolderAccess(
    studyId: string,
    accountId: string,
  ): Promise<{ result: FolderAccessResult; checkedAt: Date } | null>
  saveFolderAccess(
    studyId: string,
    accountId: string,
    result: FolderAccessResult,
    now: Date,
  ): Promise<void>
  clearFolderAccessOf(accountId: string): Promise<void>
  listFiles(
    studyId: string,
    filter: { kind?: FileKind | undefined; group?: string | undefined },
  ): Promise<InventoryFile[]>
  totals(
    studyId: string,
  ): Promise<{ byKind: Record<FileKind, number>; byGroup: { group: string; count: number }[] }>
  /** Folder of each study; the name only where this account's last access check was granted (FR-010a). */
  folderSummaries(
    accountId: string,
    studyIds: readonly string[],
  ): Promise<ReadonlyMap<string, { folderName: string | null }>>
  accountName(accountId: string): Promise<string | null>
  /** Names of several accounts in one read (deleted accounts have none). */
  accountNames(accountIds: readonly string[]): Promise<ReadonlyMap<string, string>>
  listSessions(studyId: string): Promise<Session[]>
  getSession(id: string): Promise<Session | null>
  /**
   * Writes the session if its version is still `expected` (and adds one), under the study's lock;
   * `linked` when its planned interview is held by another session of the study, `media-taken`
   * when another session holds one of its recordings (FR-004).
   */
  saveSession(
    session: Session,
    expected: number,
    /**
     * Rows without transcript whose recordings join this session: they lose them in the same
     * transaction, and go when none is left.
     */
    release?: readonly string[],
  ): Promise<SessionWrite>
  /** Proposes the sessions of an inventory taken before sessions existed (spec 008 SC-001). */
  backfillSessions(studyId: string, now: Date): Promise<void>
  /** Clears `from`'s link and writes `to`, both versions checked, in one transaction. */
  moveLink(
    from: Session,
    to: Session,
    expected: { from: number; to: number },
  ): Promise<SessionWrite>
}

export type InventoryJob = InventoryRun & { readonly accountId: string }

export type IngestionDeps = {
  readonly store: IngestionStore
  readonly studies: StudyDirectory
  readonly schedule: Schedule
  readonly members: Members
  readonly drive: {
    readonly gateway: DriveGateway
    readonly authorization: DriveAuthorization
  } | null
  readonly cipher: {
    encrypt(clear: string, owner: string): string
    decrypt(stored: string, owner: string): string
  }
  readonly enqueueInventory: (job: InventoryJob) => Promise<boolean>
  readonly clock: Clock
  readonly log: {
    warn(object: object, message: string): void
    error(object: object, message: string): void
  }
}
