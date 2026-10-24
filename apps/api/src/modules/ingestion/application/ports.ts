import type { Clock } from '@goodresearch/shared'
import type { FileKind } from '../domain/classify.ts'
import type { DriveAuthorization, DriveGateway } from '../domain/drive-gateway.ts'
import type { FolderAccessResult } from '../domain/folder-access.ts'
import type { InventoryRun } from '../domain/inventory-run.ts'
import type { InventoryFile, InventoryProgress } from '../domain/inventory-walk.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

/** Who may see a study at all (its project's team): implemented by the research module. */
export type StudyDirectory = {
  getStudyAccess(accountId: string, studyId: string): Promise<{ role: 'admin' | 'member' } | null>
}

export type SourceConnection = {
  readonly accountId: string
  readonly connector: 'google-drive'
  readonly externalAccount: string
  readonly encryptedRefreshToken: string
  readonly status: 'connected' | 'lost'
  readonly connectedAt: Date
}

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
  /** Attaches (or replaces) a folder: previous files, access checks and runs are discarded. */
  attachSource(source: StudySource): Promise<void>
  deleteSource(studyId: string): Promise<void>
  /** Starts a new run unless an active (non-stale) one exists; returns it, or null. */
  startInventory(studyId: string, runBy: string, now: Date): Promise<InventoryRun | null>
  /** The writes below apply only to the current run of the same folder (see InventoryRun). */
  updateProgress(run: InventoryRun, progress: InventoryProgress): Promise<void>
  /** Replaces the files and marks the run done, atomically; false when the run is no longer current. */
  completeInventory(
    run: InventoryRun,
    files: readonly InventoryFile[],
    folder: { name: string; ownerName: string | null },
    now: Date,
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
}

export type InventoryJob = InventoryRun & { readonly accountId: string }

export type IngestionDeps = {
  readonly store: IngestionStore
  readonly studies: StudyDirectory
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
