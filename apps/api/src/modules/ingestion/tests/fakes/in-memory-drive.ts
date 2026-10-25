import type { DriveAuthorization, DriveGateway, DriveItem } from '../../domain/drive-gateway.ts'
import { DriveConnectionLost, FOLDER_MIME } from '../../domain/drive-gateway.ts'
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
  readonly documents = new InMemoryDriveDocuments((token) => this.#account(token))

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
  }

  share(folderId: string, googleAccount: string): void {
    const set = this.sharedWith.get(folderId) ?? new Set()
    set.add(googleAccount)
    this.sharedWith.set(folderId, set)
  }

  #account(refreshToken: string): string {
    if (this.outage) throw new Error('Drive unavailable (503)')
    const account = this.tokens.get(refreshToken)
    if (!account) throw new DriveConnectionLost()
    return account
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

  authorizationUrl(input: { state: string }): string {
    return `https://accounts.google.test/consent?state=${input.state}`
  }

  /** Consents asked, in order (`read` or `write`). */
  readonly consents: ('read' | 'write')[] = []

  async exchange(input: {
    access: 'read' | 'write'
  }): Promise<{ refreshToken: string; externalAccount: string; access: 'read' | 'write' }> {
    this.consents.push(input.access)
    const refreshToken = `token-${this.tokens.size + 1}`
    this.tokens.set(refreshToken, this.nextConsentAccount)
    return { refreshToken, externalAccount: this.nextConsentAccount, access: input.access }
  }

  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken)
    this.tokens.delete(refreshToken)
  }
}
