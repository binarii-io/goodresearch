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
  /** When the file last changed at the source (a rename changes it too); null when unknown. */
  readonly modifiedAt?: string | null
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

/** One slide of a presentation written by goodresearch (spec 015): a title, lines, a table. */
export type PresentationSlide = {
  readonly title: string
  /** The opening and closing slides: a centred title, the lines under it. */
  readonly cover?: boolean | undefined
  readonly lines?: readonly string[] | undefined
  readonly table?:
    | { readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] }
    | undefined
}

export interface DriveDocuments {
  /**
   * A new presentation in `folderId` with these slides (spec 015); `written` is false when the
   * file was created but its slides could not be written (it is returned so it can be tracked).
   * `revision`: the presentation's content revision after the write, null when unknown.
   */
  createPresentation(
    refreshToken: string,
    folderId: string,
    name: string,
    slides: readonly PresentationSlide[],
  ): Promise<CreatedFile & { written: boolean; revision: string | null }>
  /**
   * Replaces every slide of the same presentation (same file, link and sharing). With `expected`,
   * only while its content is still at that revision, checked in the write itself: else
   * DriveRevisionMismatch. Sharing or renaming the file does not change it.
   */
  rewritePresentation(
    refreshToken: string,
    fileId: string,
    slides: readonly PresentationSlide[],
    expected: string | null,
  ): Promise<{ revision: string | null }>
  /** A new folder inside `parentId` (spec 011: the clean transcripts). */
  createFolder(refreshToken: string, parentId: string, name: string): Promise<CreatedFile>
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
  /**
   * Gives the file a new name, nothing else (spec 009 FR-009); `null` when it does not exist or
   * the person cannot open it, DriveCannotEdit when they may not edit it.
   */
  renameFile(refreshToken: string, fileId: string, name: string): Promise<FileMeta | null>
}
