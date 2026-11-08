import type {
  DriveAuthorization,
  DriveGateway,
  DriveItem,
  GrantProblem,
  VideoRange,
} from '../../domain/drive-gateway.ts'
import {
  DriveConnectionLost,
  DriveScopeMissing,
  FOLDER_MIME,
  TranscriptUnreadable,
} from '../../domain/drive-gateway.ts'
import { InMemoryDriveDocuments } from '../../infrastructure/in-memory.drive-documents.ts'

/**
 * A fake Google Drive: items, which Google accounts can open which folder trees, and refresh tokens
 * per Google account. Only read operations exist, like the real adapter.
 */
export class InMemoryDrive implements DriveGateway, DriveAuthorization {
  readonly items = new Map<string, DriveItem>()
  /** Folder id → Google accounts allowed to open it (and everything below it). */
  readonly sharedWith = new Map<string, Set<string>>()
  readonly tokens = new Map<string, string>()
  readonly revoked: string[] = []
  /** Google account of the next consent (what the person picks on Google's screen). */
  nextConsentAccount = 'alice@example.org'
  listCalls = 0
  /** Simulates Google Drive not answering. */
  outage = false
  /** Published files (spec 007), opened with the same Google accounts. */
  readonly documents = new InMemoryDriveDocuments(
    (token) => this.#account(token),
    (id, name) => {
      const item = this.items.get(id)
      if (item) this.items.set(id, { ...item, name })
    },
  )
  /** Text of transcripts by file id (spec 009); `unreadable` files throw like a `.doc`. */
  readonly texts = new Map<string, string>()
  readonly unreadable = new Set<string>()
  /** Every text read, with its length asked. */
  readonly reads: { id: string; maxChars: number }[] = []

  addFolder(id: string, name: string, parent?: string, owner = 'Alice'): void {
    this.items.set(id, {
      id,
      name,
      mimeType: FOLDER_MIME,
      ...(parent ? { parents: [parent] } : {}),
      ownerName: owner,
      webViewLink: `https://drive.google.com/drive/folders/${id}`,
    })
  }

  addFile(id: string, name: string, parent: string, mimeType = 'video/mp4'): void {
    this.items.set(id, {
      id,
      name,
      mimeType,
      parents: [parent],
      size: 1,
      modifiedTime: '2026-10-01T00:00:00Z',
    })
    this.documents.adopt(id, name, [parent])
  }

  share(folderId: string, googleAccount: string): void {
    const set = this.sharedWith.get(folderId) ?? new Set()
    set.add(googleAccount)
    this.sharedWith.set(folderId, set)
  }

  /** Spec 030: grants Google now refuses, with the reason. */
  readonly refused = new Map<string, Exclude<GrantProblem, 'unreadable'>>()
  /** Spec 030: the next consent comes back without the Drive right. */
  untickNext = false

  refuse(refreshToken: string, reason: Exclude<GrantProblem, 'unreadable'>): void {
    this.refused.set(refreshToken, reason)
  }

  #account(refreshToken: string): string {
    if (this.outage) throw new Error('Drive unavailable (503)')
    const refusal = this.refused.get(refreshToken)
    if (refusal) throw new DriveConnectionLost(refusal)
    const account = this.tokens.get(refreshToken)
    if (!account) throw new DriveConnectionLost()
    return account
  }

  async checkGrant(refreshToken: string): Promise<'ok' | 'unreachable'> {
    if (this.outage) return 'unreachable'
    this.#account(refreshToken)
    return 'ok'
  }

  #canOpen(account: string, id: string): boolean {
    let current: DriveItem | undefined = this.items.get(id)
    while (current) {
      if (this.sharedWith.get(current.id)?.has(account)) return true
      const parent = current.parents?.[0]
      current = parent ? this.items.get(parent) : undefined
    }
    return false
  }

  /** Tab titles of documents (spec 008); a document without an entry cannot be read. */
  readonly tabs = new Map<string, string[]>()

  async documentTabs(refreshToken: string, id: string): Promise<readonly string[] | null> {
    this.#account(refreshToken)
    return this.tabs.get(id) ?? null
  }

  /** Meeting notes of documents by file id (other tabs than the transcript). */
  readonly notes = new Map<string, string>()

  async readNotesStart(refreshToken: string, id: string, maxChars: number): Promise<string | null> {
    this.#account(refreshToken)
    return this.notes.get(id)?.slice(0, maxChars) ?? null
  }

  async readTextStart(
    refreshToken: string,
    file: { id: string },
    maxChars: number,
  ): Promise<string | null> {
    const account = this.#account(refreshToken)
    this.reads.push({ id: file.id, maxChars })
    if (this.unreadable.has(file.id)) throw new TranscriptUnreadable()
    if (!this.items.has(file.id) || !this.#canOpen(account, file.id)) return null
    return (this.texts.get(file.id) ?? '').slice(0, maxChars)
  }

  /** Spec 038: the bytes of files (videos), by file id. */
  readonly bytes = new Map<string, Uint8Array>()

  async videoRange(
    refreshToken: string,
    id: string,
    range: string | null,
  ): Promise<VideoRange | null> {
    const account = this.#account(refreshToken)
    const data = this.bytes.get(id)
    if (!data || !this.items.has(id) || !this.#canOpen(account, id)) return null
    const m = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
    const start = m ? Number(m[1]) : 0
    const end = m?.[2] ? Math.min(Number(m[2]), data.byteLength - 1) : data.byteLength - 1
    const part = data.slice(start, end + 1)
    return {
      status: m ? 206 : 200,
      contentType: this.items.get(id)?.mimeType ?? 'video/mp4',
      contentLength: part.byteLength,
      contentRange: m ? `bytes ${start}-${end}/${data.byteLength}` : null,
      body: (async function* () {
        yield part
      })(),
    }
  }

  async getItem(refreshToken: string, id: string): Promise<DriveItem | null> {
    const account = this.#account(refreshToken)
    const item = this.items.get(id)
    return item && this.#canOpen(account, id) ? item : null
  }

  async *listChildren(
    refreshToken: string,
    parentIds: readonly string[],
  ): AsyncIterable<DriveItem[]> {
    const account = this.#account(refreshToken)
    this.listCalls++
    yield [...this.items.values()].filter(
      (i) =>
        i.parents?.some((p) => parentIds.includes(p)) && this.#canOpen(account, i.id) && !i.trashed,
    )
  }

  authorizationUrl(input: { state: string; loginHint: string }): string {
    const hint = input.loginHint ? `&login_hint=${encodeURIComponent(input.loginHint)}` : ''
    return `https://accounts.google.test/consent?state=${input.state}${hint}`
  }

  /** Consents asked, in order (`read` or `write`). */
  readonly consents: ('read' | 'write')[] = []

  async exchange(input: {
    access: 'read' | 'write'
  }): Promise<{ refreshToken: string; externalAccount: string; access: 'read' | 'write' }> {
    this.consents.push(input.access)
    if (this.untickNext) {
      this.untickNext = false
      throw new DriveScopeMissing()
    }
    const refreshToken = `token-${this.tokens.size + 1}`
    this.tokens.set(refreshToken, this.nextConsentAccount)
    return { refreshToken, externalAccount: this.nextConsentAccount, access: input.access }
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken)
    this.tokens.delete(refreshToken)
  }
}
