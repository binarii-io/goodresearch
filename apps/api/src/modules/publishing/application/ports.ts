import type { Result } from '@goodresearch/shared'
import type { GuideContent, GuideInput } from '../domain/guide.ts'
import type { DocModel, Language, TableModel, TableRead } from '../domain/model.ts'
import type { PlannedRow } from '../domain/schedule.ts'
import type { ChangeKind, FileState } from '../domain/three-way.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type PublicationKind = 'guide' | 'best-practices' | 'schedule'

export type FileMeta = {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly trashed: boolean
  readonly parents: readonly string[]
  readonly canEdit: boolean
  readonly ownerName: string | null
  readonly lastEditorName: string | null
  readonly webViewLink: string
}

type FileError = 'DRIVE_NOT_CONNECTED' | 'DRIVE_CANNOT_EDIT' | 'DRIVE_CHANGED_MEANWHILE'

/** The study folder's files with the acting person's own access (ingestion module). */
export type StudyFiles = {
  readonly folderId: string
  createDocument(
    name: string,
    doc: DocModel,
  ): Promise<Result<{ id: string; webViewLink: string }, FileError>>
  readDocument(fileId: string): Promise<Result<{ doc: DocModel; revision: string }, FileError>>
  rewriteDocument(fileId: string, doc: DocModel, revision: string): Promise<Result<void, FileError>>
  createTable(
    name: string,
    table: TableModel,
  ): Promise<Result<{ id: string; webViewLink: string }, FileError>>
  readTable(
    fileId: string,
    table: Pick<TableModel, 'columns' | 'timeZone'>,
  ): Promise<Result<TableRead, FileError>>
  rewriteTable(fileId: string, table: TableModel): Promise<Result<void, FileError>>
  metadata(fileId: string): Promise<Result<FileMeta | null, FileError>>
}

export type StudyFilesError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NO_SOURCE_FOLDER'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_UNAVAILABLE'
  | 'DRIVE_WRITE_REQUIRED'

export type FilesPort = (
  accountId: string,
  studyId: string,
  access: 'read' | 'write',
) => Promise<Result<StudyFiles, StudyFilesError>>

/** The study's preparation, read with the person's permissions (research module). */
export type PreparationReads = {
  studyName(accountId: string, studyId: string): Promise<string | null>
  /** `null` when there is no guide; an error code without access. */
  guide(
    accountId: string,
    studyId: string,
  ): Promise<Result<{ content: GuideContent; version: number } | null, string>>
  schedule(
    accountId: string,
    studyId: string,
  ): Promise<Result<(PlannedRow & { version: number })[], string>>
}

/** Research commands that apply accepted Drive changes (same rules as the app's editors). */
export type PreparationActions = {
  saveGuide(c: {
    actor: Actor
    studyId: string
    content: GuideInput
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  addPlanned(c: {
    actor: Actor
    studyId: string
    fields: Omit<PlannedRow, 'id'>
  }): Promise<{ ok: true } | { ok: false; error: string }>
  updatePlanned(c: {
    actor: Actor
    id: string
    fields: Omit<PlannedRow, 'id'>
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  deletePlanned(c: {
    actor: Actor
    id: string
  }): Promise<{ ok: true } | { ok: false; error: string }>
}

export type UnavailableReason = 'missing' | 'trashed' | 'moved'

/** A published file (PublishedDocument aggregate, data-model.md). Items as [key, value] pairs. */
export type StoredPublication = {
  readonly id: string
  readonly studyId: string
  readonly kind: PublicationKind
  readonly fileId: string
  readonly fileName: string
  readonly webLink: string
  readonly language: Language
  readonly timeZone: string | null
  /** The items read back after the last write. */
  readonly base: readonly [string, unknown][]
  readonly baseVersion: number
  readonly baseRevision: string | null
  /** Increases at every change of the base; a check is recorded only on the base it compared. */
  readonly baseRev: number
  /** The items of the file at the last check, and the file version and revision then. */
  readonly drive: readonly [string, unknown][] | null
  readonly checkedVersion: number | null
  readonly checkedRevision: string | null
  /** The app's guide version at the last check (accepting refuses when it moved). */
  readonly appVersion: number | null
  readonly state: FileState | 'unavailable'
  readonly unavailableReason: UnavailableReason | null
  readonly lastCheckedAt: Date | null
  readonly lastEditor: string | null
  readonly publishedBy: string | null
  readonly publishedAt: Date
  readonly updatedBy: string | null
  readonly updatedAt: Date
}

export type StoredChange = {
  readonly id: string
  readonly publicationId: string
  readonly key: string
  readonly kind: ChangeKind
  readonly base: unknown
  readonly app: unknown
  readonly drive: unknown
  readonly decision: 'pending' | 'accepted' | 'rejected'
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
}

export interface PublishingStore {
  listByStudy(studyId: string): Promise<StoredPublication[]>
  get(id: string): Promise<StoredPublication | null>
  /** False when the study already has a publication of this kind. */
  insert(publication: StoredPublication): Promise<boolean>
  save(publication: StoredPublication): Promise<void>
  /** Writes a new base only if the stored counter is still `expectedRev`; true when written. */
  saveBase(publication: StoredPublication, expectedRev: number): Promise<boolean>
  /**
   * Records a check (state, what the file holds, versions) only while the base is still the one
   * the check compared against; otherwise an update or decision made meanwhile wins.
   */
  saveCheck(publication: StoredPublication, pending: StoredChange[] | null): Promise<void>
  /** Moves only the time of the last check. */
  touchChecked(id: string, at: Date): Promise<void>
  delete(id: string): Promise<void>
  changes(publicationId: string): Promise<StoredChange[]>
  /** Replaces the pending changes; decided ones are kept. */
  replacePending(publicationId: string, changes: StoredChange[]): Promise<void>
  /** Moves changes from `pending` to a decision; returns the ones this call decided. */
  decide(
    publicationId: string,
    ids: readonly string[],
    decision: 'accepted' | 'rejected',
    by: string,
    at: Date,
  ): Promise<StoredChange[]>
  /** Gives claimed changes back (an apply failed). */
  undecide(ids: readonly string[]): Promise<void>
  clearChanges(publicationId: string): Promise<void>
  /** The changes of several publications at once. */
  changesOf(publicationIds: readonly string[]): Promise<StoredChange[]>
  accountNames(accountIds: readonly string[]): Promise<ReadonlyMap<string, string>>
}

export type PublishingDeps = {
  readonly store: PublishingStore
  readonly files: FilesPort
  readonly reads: PreparationReads
  readonly actions: PreparationActions
  readonly clock: { now(): Date }
  readonly newId: () => string
}
