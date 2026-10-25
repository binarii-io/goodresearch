export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

/** Metadata of a Drive item, as the domain needs it (no content). */
export type DriveItem = {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly parents?: readonly string[]
  readonly size?: number
  readonly modifiedTime?: string
  readonly webViewLink?: string
  readonly ownerName?: string
  readonly driveId?: string
  readonly trashed?: boolean
  readonly shortcutTargetId?: string
  readonly shortcutTargetMimeType?: string
}

/** The person's Drive authorization is unusable (revoked, expired): they must reconnect. */
export class DriveConnectionLost extends Error {
  override name = 'DriveConnectionLost'
}

/** Drive refused to list a folder for this person (no longer shared, domain policy). */
export class DriveAccessDenied extends Error {
  override name = 'DriveAccessDenied'
}

/** Drive returned an incomplete listing; the inventory must not be trusted. */
export class DriveIncompleteListing extends Error {
  override name = 'DriveIncompleteListing'
}

/**
 * Read-only access to Drive with one person's own authorization (FR-008, FR-010). Every method takes
 * that person's refresh token; implementations never write to Drive.
 */
export interface DriveGateway {
  /** The item, or null when it does not exist or the person cannot open it. */
  getItem(refreshToken: string, id: string): Promise<DriveItem | null>
  /** Children of the given folders (not trashed), page by page. */
  listChildren(
    refreshToken: string,
    parentIds: readonly string[],
    driveId?: string,
  ): AsyncIterable<DriveItem[]>
}

/**
 * OAuth consent for Drive, separate from sign-in (FR-007): `read` for the folders (spec 002),
 * `write` to edit the files the person can edit (spec 007), asked only when publishing.
 */
export interface DriveAuthorization {
  authorizationUrl(input: {
    state: string
    codeChallenge: string
    loginHint: string
    access: 'read' | 'write'
  }): string
  /** Exchanges the callback code; fails when the scope asked was not granted. */
  exchange(input: {
    code: string
    codeVerifier: string
    access: 'read' | 'write'
  }): Promise<{ refreshToken: string; externalAccount: string; access: 'read' | 'write' }>
  /** Revokes the grant at Google (FR-009). */
  revoke(refreshToken: string): Promise<void>
}
