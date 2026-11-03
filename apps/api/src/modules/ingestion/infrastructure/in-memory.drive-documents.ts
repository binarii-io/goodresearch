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
import type {
  FormOperation,
  FormRead,
  FormReadBlock,
  FormResponse,
  FormWriteBlock,
} from '../domain/form-model.ts'

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
  slides?: PresentationSlide[]
  form?: Omit<FormRead, 'revision'>
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
  /** Told when the app moves a file or creates a folder (spec 024). */
  readonly onMove: (fileId: string, to: string) => void
  readonly onFolder: (id: string, name: string, parent: string) => void

  constructor(
    accountOf: (refreshToken: string) => string,
    onRename: (fileId: string, name: string) => void = () => {},
    onMove: (fileId: string, to: string) => void = () => {},
    onFolder: (id: string, name: string, parent: string) => void = () => {},
  ) {
    this.accountOf = accountOf
    this.onRename = onRename
    this.onMove = onMove
    this.onFolder = onFolder
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
    const created = this.#create(refreshToken, parentId, name, {})
    this.onFolder(created.id, name, parentId)
    return created
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

  #formIds = 0

  #applyForm(blocks: readonly FormReadBlock[], operations: readonly FormOperation[]) {
    const next = [...blocks]
    const nextId = () => `form-id-${++this.#formIds}`
    const read = (block: FormWriteBlock, formItemId: string): FormReadBlock => {
      const asked =
        block.kind === 'section' || block.kind === 'text' || block.kind === 'unsupported'
      if (block.kind === 'grid')
        return {
          ...block,
          formItemId,
          questionId: null,
          rows: block.rows.map((r) => ({ title: r.title, questionId: r.questionId ?? nextId() })),
        }
      return { ...block, formItemId, questionId: asked ? null : (block.questionId ?? nextId()) }
    }
    for (const op of operations) {
      if (op.type === 'create') next.splice(op.index, 0, read(op.block, nextId()))
      else if (op.type === 'update') next[op.index] = read(op.block, op.formItemId)
      else if (op.type === 'delete') next.splice(op.index, 1)
      else {
        const [moved] = next.splice(op.from, 1)
        if (moved) next.splice(op.to, 0, moved)
      }
    }
    return next
  }

  async createForm(
    refreshToken: string,
    folderId: string,
    name: string,
    _title: string,
    operations: readonly FormOperation[],
  ) {
    return this.#create(refreshToken, folderId, name, {
      form: {
        blocks: this.#applyForm([], operations),
        linkedSheetLink: null,
        responderLink: `https://forms.example.test/${name.length}`,
        acceptingResponses: false,
        collectsIdentity: false,
      },
    })
  }

  async readForm(refreshToken: string, fileId: string): Promise<FormRead> {
    const opened = this.#open(refreshToken, fileId)
    if (!opened?.file.form) throw new DriveCannotEdit()
    return { ...structuredClone(opened.file.form), revision: String(opened.file.revision) }
  }

  async updateForm(
    refreshToken: string,
    fileId: string,
    operations: readonly FormOperation[],
    revision: string,
  ) {
    const { file, account } = this.#editable(refreshToken, fileId)
    if (!file.form) throw new DriveCannotEdit()
    if (String(file.revision) !== revision) throw new DriveRevisionMismatch()
    this.#change(file, account, {
      form: {
        ...file.form,
        collectsIdentity: false,
        blocks: this.#applyForm(file.form.blocks, operations),
      },
    })
  }

  /** Answered forms, by file id (spec 028). */
  readonly formResponses = new Map<string, FormResponse[]>()

  async listResponses(refreshToken: string, fileId: string, max: number) {
    const opened = this.#open(refreshToken, fileId)
    if (!opened?.file.form) throw new DriveCannotEdit()
    if (this.viewers.get(fileId)?.has(opened.account)) throw new DriveCannotEdit()
    const all = this.formResponses.get(fileId) ?? []
    return { responses: all.slice(0, max), complete: all.length <= max }
  }

  async setAccepting(refreshToken: string, fileId: string, open: boolean) {
    const { file } = this.#editable(refreshToken, fileId)
    if (!file.form) throw new DriveCannotEdit()
    file.form = { ...file.form, acceptingResponses: open }
  }

  /** Someone answers the form. */
  respond(fileId: string, response: FormResponse): void {
    this.formResponses.set(fileId, [...(this.formResponses.get(fileId) ?? []), response])
  }

  /** Someone deletes a response at the source. */
  removeResponse(fileId: string, id: string): void {
    this.formResponses.set(
      fileId,
      (this.formResponses.get(fileId) ?? []).filter((r) => r.id !== id),
    )
  }

  /** Someone edits the form at the source. */
  editForm(
    fileId: string,
    by: string,
    change: (form: Omit<FormRead, 'revision'>) => Omit<FormRead, 'revision'>,
  ): void {
    const file = this.files.get(fileId)
    if (!file?.form) throw new Error(`no form ${fileId}`)
    this.#change(file, by, { form: change(structuredClone(file.form)) })
  }

  async createPresentation(
    refreshToken: string,
    folderId: string,
    name: string,
    slides: readonly PresentationSlide[],
  ) {
    const file = this.#create(refreshToken, folderId, name, {
      slides: structuredClone([...slides]),
    })
    return { ...file, written: true, revision: String(this.files.get(file.id)?.revision ?? 1) }
  }

  async rewritePresentation(
    refreshToken: string,
    fileId: string,
    slides: readonly PresentationSlide[],
    expected: string | null,
  ) {
    const { file, account } = this.#editable(refreshToken, fileId)
    if (!file.slides) throw new DriveCannotEdit()
    if (expected !== null && String(file.revision) !== expected) throw new DriveRevisionMismatch()
    this.#change(file, account, { slides: structuredClone([...slides]) })
    return { revision: String(file.revision) }
  }

  /** The slides of a presentation, as written (tests, the dev stack). */
  slidesOf(fileId: string): readonly PresentationSlide[] | null {
    return this.files.get(fileId)?.slides ?? null
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

  async moveFile(refreshToken: string, fileId: string, _from: readonly string[], to: string) {
    const { file, account } = this.#editable(refreshToken, fileId)
    Object.assign(file, { parents: [to], version: file.version + 1, lastEditor: account })
    this.onMove(fileId, to)
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
