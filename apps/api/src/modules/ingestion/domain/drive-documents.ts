/**
 * Documents and tables written to a source with one person's own access (spec 007). Neutral
 * models: the publishing module renders and reads them; adapters translate them for a connector
 * (Google Docs and Sheets first). Anchors and row ids are invisible to people in the files.
 */

export type DocBlock =
  | {
      readonly kind: 'heading'
      readonly level: 1 | 2 | 3
      readonly text: string
      readonly anchor?: string
    }
  | { readonly kind: 'paragraph'; readonly text: string; readonly anchor?: string }
  | {
      readonly kind: 'listItem'
      readonly level: 0 | 1
      readonly text: string
      readonly anchor?: string
    }

export type DocModel = { readonly blocks: readonly DocBlock[] }

export type TableColumn = {
  readonly key: string
  readonly title: string
  readonly type: 'text' | 'status' | 'datetime'
  /** Allowed values of a `status` column. */
  readonly options?: readonly string[]
}

/** `datetime` cells are ISO instants; the file shows them in `timeZone`. */
export type TableModel = {
  readonly sheetTitle: string
  readonly timeZone: string
  readonly columns: readonly TableColumn[]
  readonly rows: readonly {
    readonly id: string
    readonly cells: Readonly<Record<string, string | null>>
  }[]
}

/** A table as read back: the header titles found, and rows by id (`null` id: added by a person). */
export type TableRead = {
  readonly headers: readonly string[]
  /** False when the hidden id column was moved or removed: row ids are then not trusted. */
  readonly idColumn: boolean
  readonly rows: readonly {
    readonly id: string | null
    readonly cells: Readonly<Record<string, string | null>>
  }[]
}

export type FileMeta = {
  readonly id: string
  readonly name: string
  /** Increases at every change of the file, content or metadata. */
  readonly version: number
  readonly trashed: boolean
  readonly parents: readonly string[]
  /** Whether this person can edit the file at the source. */
  readonly canEdit: boolean
  readonly ownerName: string | null
  readonly lastEditorName: string | null
  readonly webViewLink: string
}

export type CreatedFile = { readonly id: string; readonly webViewLink: string }

/** The document changed since the revision the caller read: nothing was written. */
export class DriveRevisionMismatch extends Error {
  override name = 'DriveRevisionMismatch'
}

/** The person cannot edit this file at the source. */
export class DriveCannotEdit extends Error {
  override name = 'DriveCannotEdit'
}

export interface DriveDocuments {
  createDocument(
    refreshToken: string,
    folderId: string,
    name: string,
    doc: DocModel,
  ): Promise<CreatedFile>
  /** The blocks with their anchors, and the revision to give to `rewriteDocument`. */
  readDocument(refreshToken: string, fileId: string): Promise<{ doc: DocModel; revision: string }>
  /** Replaces the whole content of the same file, only if it is still at `revision`. */
  rewriteDocument(
    refreshToken: string,
    fileId: string,
    doc: DocModel,
    revision: string,
  ): Promise<void>
  createTable(
    refreshToken: string,
    folderId: string,
    name: string,
    table: TableModel,
  ): Promise<CreatedFile>
  readTable(
    refreshToken: string,
    fileId: string,
    table: Pick<TableModel, 'columns' | 'timeZone'>,
  ): Promise<TableRead>
  rewriteTable(refreshToken: string, fileId: string, table: TableModel): Promise<void>
  /** `null` when the file does not exist or the person cannot open it. */
  metadata(refreshToken: string, fileId: string): Promise<FileMeta | null>
}
