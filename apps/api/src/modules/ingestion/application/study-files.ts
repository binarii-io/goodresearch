import { err, ok, type Result } from '@goodresearch/shared'
import {
  type CreatedFile,
  type DocModel,
  DriveCannotEdit,
  type DriveDocuments,
  DriveRevisionMismatch,
  type FileMeta,
  type PresentationSlide,
  type TableModel,
  type TableRead,
} from '../domain/drive-documents.ts'
import { DriveConnectionLost, type DriveItem } from '../domain/drive-gateway.ts'
import {
  type FormOperation,
  type FormRead,
  type FormResponse,
  FormServiceDisabled,
} from '../domain/form-model.ts'
import { resolveStudyAccess } from './access.ts'
import { readRefreshToken } from './connection.ts'
import type { IngestionDeps } from './ports.ts'

export type StudyFilesError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NO_SOURCE_FOLDER'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_UNAVAILABLE'
  | 'DRIVE_WRITE_REQUIRED'

export type FileError = 'DRIVE_NOT_CONNECTED' | 'DRIVE_CANNOT_EDIT' | 'DRIVE_CHANGED_MEANWHILE'
type FormFileError = FileError | 'FORMS_DISABLED'

/**
 * The files of a study's folder, used with one person's own access (spec 007). The token never
 * leaves this module: callers get operations bound to it.
 */
export type StudyFiles = {
  readonly folderId: string
  createDocument(name: string, doc: DocModel): Promise<Result<CreatedFile, FileError>>
  readDocument(fileId: string): Promise<Result<{ doc: DocModel; revision: string }, FileError>>
  rewriteDocument(fileId: string, doc: DocModel, revision: string): Promise<Result<void, FileError>>
  createTable(name: string, table: TableModel): Promise<Result<CreatedFile, FileError>>
  readTable(
    fileId: string,
    table: Pick<TableModel, 'columns' | 'timeZone'>,
  ): Promise<Result<TableRead, FileError>>
  rewriteTable(fileId: string, table: TableModel): Promise<Result<void, FileError>>
  /** Spec 015: a presentation in the study's folder, then rewritten in place. */
  createPresentation(
    name: string,
    slides: readonly PresentationSlide[],
  ): Promise<Result<CreatedFile & { written: boolean; revision: string | null }, FileError>>
  rewritePresentation(
    fileId: string,
    slides: readonly PresentationSlide[],
    expected: string | null,
  ): Promise<Result<{ revision: string | null }, FileError>>
  /** Spec 027: the study's form. */
  createForm(
    name: string,
    title: string,
    operations: readonly FormOperation[],
  ): Promise<Result<CreatedFile, FormFileError>>
  readForm(fileId: string): Promise<Result<FormRead, FormFileError>>
  updateForm(
    fileId: string,
    operations: readonly FormOperation[],
    revision: string,
  ): Promise<Result<void, FormFileError>>
  listResponses(
    fileId: string,
    max: number,
  ): Promise<Result<{ responses: FormResponse[]; complete: boolean }, FormFileError>>
  setAccepting(fileId: string, open: boolean): Promise<Result<void, FormFileError>>
  metadata(fileId: string): Promise<Result<FileMeta | null, FileError>>
  renameFile(fileId: string, name: string): Promise<Result<FileMeta | null, FileError>>
  /** Spec 024: reading and moving, for the assistant's work in the folder. */
  item(id: string): Promise<Result<DriveItem | null, FileError>>
  list(folderIds: readonly string[], max: number): Promise<Result<DriveItem[], FileError>>
  readStart(item: DriveItem, maxChars: number): Promise<Result<string | null, FileError>>
  moveFile(id: string, from: readonly string[], to: string): Promise<Result<void, FileError>>
  createFolderIn(parent: string, name: string): Promise<Result<{ id: string }, FileError>>
  /** Spec 011: a folder inside the study folder, found again by its id while it is still there. */
  ensureFolder(name: string, knownId: string | null): Promise<Result<{ id: string }, FileError>>
  /** A document inside a folder of the study folder. */
  createDocumentIn(
    folderId: string,
    name: string,
    doc: DocModel,
  ): Promise<Result<CreatedFile, FileError>>
  /** The document's revision now; null when it is gone or cannot be opened. */
  revision(fileId: string): Promise<Result<string | null, FileError>>
}

export const makeStudyFiles =
  (deps: IngestionDeps, documents: DriveDocuments | null) =>
  async (
    accountId: string,
    studyId: string,
    access: 'read' | 'write',
  ): Promise<Result<StudyFiles, StudyFilesError>> => {
    // The study's team first: outside it, nothing else is told (PR #7 review).
    if (!(await deps.studies.getStudyAccess(accountId, studyId))) return err('STUDY_NOT_FOUND')
    if (!deps.drive || !documents) return err('DRIVE_NOT_CONFIGURED')
    const study = await resolveStudyAccess(deps, accountId, studyId)
    if (study.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (study.kind === 'drive-not-connected') return err('DRIVE_NOT_CONNECTED')
    if (study.kind === 'drive-unavailable') return err('DRIVE_UNAVAILABLE')
    if (study.kind === 'no-folder-access') return err('FOLDER_ACCESS_REQUIRED')
    if (!study.source) return err('NO_SOURCE_FOLDER')
    const connection = await deps.store.getConnection(accountId)
    const token = await readRefreshToken(deps, connection)
    if (!token || !connection) return err('DRIVE_NOT_CONNECTED')
    if (access === 'write' && connection.access !== 'write') return err('DRIVE_WRITE_REQUIRED')

    /** Source failures as values; anything else is a bug or an outage and is thrown. */
    const run = async <T>(work: () => Promise<T>): Promise<Result<T, FileError>> => {
      try {
        return ok(await work())
      } catch (error) {
        if (error instanceof DriveConnectionLost) {
          await deps.store.markConnectionLost(accountId)
          return err('DRIVE_NOT_CONNECTED')
        }
        if (error instanceof DriveCannotEdit) return err('DRIVE_CANNOT_EDIT')
        if (error instanceof DriveRevisionMismatch) return err('DRIVE_CHANGED_MEANWHILE')
        throw error
      }
    }
    const runForm = async <T>(work: () => Promise<T>): Promise<Result<T, FormFileError>> => {
      try {
        return await run(work)
      } catch (error) {
        if (error instanceof FormServiceDisabled) return err('FORMS_DISABLED')
        throw error
      }
    }
    const folderId = study.source.folderId
    const { gateway } = deps.drive
    return ok({
      folderId,
      createDocument: (name, doc) =>
        run(() => documents.createDocument(token, folderId, name, doc)),
      readDocument: (fileId) => run(() => documents.readDocument(token, fileId)),
      rewriteDocument: (fileId, doc, revision) =>
        run(() => documents.rewriteDocument(token, fileId, doc, revision)),
      createTable: (name, table) => run(() => documents.createTable(token, folderId, name, table)),
      readTable: (fileId, table) => run(() => documents.readTable(token, fileId, table)),
      rewriteTable: (fileId, table) => run(() => documents.rewriteTable(token, fileId, table)),
      createPresentation: (name, slides) =>
        run(() => documents.createPresentation(token, folderId, name, slides)),
      rewritePresentation: (fileId, slides, expected) =>
        run(() => documents.rewritePresentation(token, fileId, slides, expected)),
      createForm: (name, title, operations) =>
        runForm(() => documents.createForm(token, folderId, name, title, operations)),
      readForm: (fileId) => runForm(() => documents.readForm(token, fileId)),
      updateForm: (fileId, operations, revision) =>
        runForm(() => documents.updateForm(token, fileId, operations, revision)),
      listResponses: (fileId, max) => runForm(() => documents.listResponses(token, fileId, max)),
      setAccepting: (fileId, open) => runForm(() => documents.setAccepting(token, fileId, open)),
      metadata: (fileId) => run(() => documents.metadata(token, fileId)),
      renameFile: (fileId, name) => run(() => documents.renameFile(token, fileId, name)),
      item: (id) => run(() => gateway.getItem(token, id)),
      list: (ids, max) =>
        run(async () => {
          const found: DriveItem[] = []
          const root = await gateway.getItem(token, folderId)
          for await (const page of gateway.listChildren(token, ids, root?.driveId)) {
            found.push(...page)
            if (found.length >= max) break
          }
          return found.slice(0, max)
        }),
      readStart: (item, maxChars) => run(() => gateway.readTextStart(token, item, maxChars)),
      moveFile: (id, from, to) => run(() => documents.moveFile(token, id, from, to)),
      createFolderIn: (parent, name) =>
        run(async () => ({ id: (await documents.createFolder(token, parent, name)).id })),
      ensureFolder: (name, knownId) =>
        run(async () => {
          const known = knownId ? await documents.metadata(token, knownId) : null
          if (known && !known.trashed && known.parents.includes(folderId)) return { id: known.id }
          return { id: (await documents.createFolder(token, folderId, name)).id }
        }),
      createDocumentIn: (inFolder, name, doc) =>
        run(() => documents.createDocument(token, inFolder, name, doc)),
      revision: (fileId) =>
        run(async () => {
          const meta = await documents.metadata(token, fileId)
          if (!meta || meta.trashed) return null
          return (await documents.readDocument(token, fileId)).revision
        }),
    })
  }
