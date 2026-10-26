import { err, ok, type Result } from '@goodresearch/shared'
import {
  type CreatedFile,
  type DocModel,
  DriveCannotEdit,
  type DriveDocuments,
  DriveRevisionMismatch,
  type FileMeta,
  type TableModel,
  type TableRead,
} from '../domain/drive-documents.ts'
import { DriveConnectionLost } from '../domain/drive-gateway.ts'
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
  metadata(fileId: string): Promise<Result<FileMeta | null, FileError>>
  renameFile(fileId: string, name: string): Promise<Result<FileMeta | null, FileError>>
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
    const folderId = study.source.folderId
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
      metadata: (fileId) => run(() => documents.metadata(token, fileId)),
      renameFile: (fileId, name) => run(() => documents.renameFile(token, fileId, name)),
    })
  }
