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

type StoredFile = {
  id: string
  name: string
  parents: string[]
  owner: string
  trashed: boolean
  version: number
  revision: number
  lastEditor: string
  doc?: DocModel
  table?: TableRead
}

/**
 * Documents in memory (tests and the dev stack, `DRIVE_FAKE`): who may edit is decided per file
 * like at the source; `edit`, `rename`, `move` and `trash` simulate what people do in Drive.
 */
export class InMemoryDriveDocuments implements DriveDocuments {
  readonly files = new Map<string, StoredFile>()
  /** File id → accounts that may only view it (everyone else with access may edit). */
  readonly viewers = new Map<string, Set<string>>()
  /** Accounts that cannot open a given file at all. */
  readonly hidden = new Map<string, Set<string>>()
  #next = 0

  readonly accountOf: (refreshToken: string) => string
  /** Told when the app renames a file (the simulated folder shows the new name). */
  readonly onRename: (fileId: string, name: string) => void

  constructor(
    accountOf: (refreshToken: string) => string,
    onRename: (fileId: string, name: string) => void = () => {},
  ) {
    this.accountOf = accountOf
    this.onRename = onRename
  }

  /** A file of the folder that was not published by the app (a transcript, a recording). */
  adopt(id: string, name: string, parents: readonly string[], owner = 'Drive user'): void {
    this.files.set(id, {
      id,
      name,
      parents: [...parents],
      owner,
      trashed: false,
      version: 1,
      revision: 1,
      lastEditor: owner,
    })
  }

  #open(refreshToken: string, fileId: string): { file: StoredFile; account: string } | null {
    const account = this.accountOf(refreshToken)
    const file = this.files.get(fileId)
    if (!file || this.hidden.get(fileId)?.has(account)) return null
    return { file, account }
  }

  #editable(refreshToken: string, fileId: string): { file: StoredFile; account: string } {
    const opened = this.#open(refreshToken, fileId)
    if (!opened) throw new DriveCannotEdit()
    if (this.viewers.get(fileId)?.has(opened.account)) throw new DriveCannotEdit()
    return opened
  }

  #create(refreshToken: string, folderId: string, name: string, content: Partial<StoredFile>) {
    const owner = this.accountOf(refreshToken)
    const id = `fake-file-${++this.#next}`
    this.files.set(id, {
      id,
      name,
      parents: [folderId],
      owner,
      trashed: false,
      version: 1,
      revision: 1,
      lastEditor: owner,
      ...content,
    })
    return { id, webViewLink: `https://drive.example.test/file/${id}` } satisfies CreatedFile
  }

  async createFolder(refreshToken: string, parentId: string, name: string) {
    return this.#create(refreshToken, parentId, name, {})
  }

  async createDocument(refreshToken: string, folderId: string, name: string, doc: DocModel) {
    return this.#create(refreshToken, folderId, name, { doc: structuredClone(doc) })
  }

  async readDocument(refreshToken: string, fileId: string) {
    const opened = this.#open(refreshToken, fileId)
    if (!opened?.file.doc) throw new DriveCannotEdit()
    return { doc: structuredClone(opened.file.doc), revision: String(opened.file.revision) }
  }

  async rewriteDocument(refreshToken: string, fileId: string, doc: DocModel, revision: string) {
    const { file, account } = this.#editable(refreshToken, fileId)
    if (String(file.revision) !== revision) throw new DriveRevisionMismatch()
    this.#change(file, account, { doc: structuredClone(doc) })
  }

  async createTable(refreshToken: string, folderId: string, name: string, table: TableModel) {
    return this.#create(refreshToken, folderId, name, { table: toRead(table) })
  }

  async readTable(refreshToken: string, fileId: string) {
    const opened = this.#open(refreshToken, fileId)
    if (!opened?.file.table) throw new DriveCannotEdit()
    return structuredClone(opened.file.table)
  }

  async rewriteTable(refreshToken: string, fileId: string, table: TableModel) {
    const { file, account } = this.#editable(refreshToken, fileId)
    this.#change(file, account, { table: toRead(table) })
  }

  async metadata(refreshToken: string, fileId: string): Promise<FileMeta | null> {
    const opened = this.#open(refreshToken, fileId)
    if (!opened) return null
    const { file, account } = opened
    return {
      id: file.id,
      name: file.name,
      version: file.version,
      trashed: file.trashed,
      parents: [...file.parents],
      canEdit: !this.viewers.get(fileId)?.has(account),
      ownerName: file.owner,
      lastEditorName: file.lastEditor,
      webViewLink: `https://drive.example.test/file/${file.id}`,
    }
  }

  async renameFile(refreshToken: string, fileId: string, name: string) {
    if (!this.#open(refreshToken, fileId)) return null
    const { file, account } = this.#editable(refreshToken, fileId)
    Object.assign(file, { name, version: file.version + 1, lastEditor: account })
    this.onRename(fileId, name)
    return this.metadata(refreshToken, fileId)
  }

  #change(file: StoredFile, by: string, content: Partial<StoredFile>) {
    Object.assign(file, content, {
      version: file.version + 1,
      revision: file.revision + 1,
      lastEditor: by,
    })
  }

  /** Someone edits the file in Drive. */
  edit(
    fileId: string,
    by: string,
    change: { doc?: (doc: DocModel) => DocModel; table?: (table: TableRead) => TableRead },
  ): void {
    const file = this.files.get(fileId)
    if (!file) throw new Error(`no file ${fileId}`)
    this.#change(file, by, {
      ...(change.doc && file.doc ? { doc: change.doc(structuredClone(file.doc)) } : {}),
      ...(change.table && file.table ? { table: change.table(structuredClone(file.table)) } : {}),
    })
  }

  /** Renames, moves and trashing change the version but not the content. */
  rename(fileId: string, name: string): void {
    const file = this.files.get(fileId)
    if (file) Object.assign(file, { name, version: file.version + 1 })
  }

  move(fileId: string, folderId: string): void {
    const file = this.files.get(fileId)
    if (file) Object.assign(file, { parents: [folderId], version: file.version + 1 })
  }

  trash(fileId: string): void {
    const file = this.files.get(fileId)
    if (file) Object.assign(file, { trashed: true, version: file.version + 1 })
  }
}

const toRead = (table: TableModel): TableRead => ({
  headers: table.columns.map((c) => c.title),
  idColumn: true,
  rows: table.rows.map((r) => ({ id: r.id, cells: { ...r.cells } })),
})
