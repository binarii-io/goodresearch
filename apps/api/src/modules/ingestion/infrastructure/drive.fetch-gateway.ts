import {
  DriveAccessDenied,
  DriveConnectionLost,
  type DriveGateway,
  DriveIncompleteListing,
  type DriveItem,
} from '../domain/drive-gateway.ts'

const API = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const ITEM_FIELDS =
  'id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed,driveId,owners(displayName),shortcutDetails(targetId,targetMimeType)'

type RawItem = {
  id: string
  name: string
  mimeType: string
  parents?: string[]
  size?: string
  modifiedTime?: string
  webViewLink?: string
  trashed?: boolean
  driveId?: string
  owners?: { displayName?: string }[]
  shortcutDetails?: { targetId?: string; targetMimeType?: string }
}

const toItem = (raw: RawItem): DriveItem => ({
  id: raw.id,
  name: raw.name,
  mimeType: raw.mimeType,
  ...(raw.parents ? { parents: raw.parents } : {}),
  ...(raw.size !== undefined ? { size: Number(raw.size) } : {}),
  ...(raw.modifiedTime ? { modifiedTime: raw.modifiedTime } : {}),
  ...(raw.webViewLink ? { webViewLink: raw.webViewLink } : {}),
  ...(raw.trashed !== undefined ? { trashed: raw.trashed } : {}),
  ...(raw.driveId ? { driveId: raw.driveId } : {}),
  ...(raw.owners?.[0]?.displayName ? { ownerName: raw.owners[0].displayName } : {}),
  ...(raw.shortcutDetails?.targetId ? { shortcutTargetId: raw.shortcutDetails.targetId } : {}),
  ...(raw.shortcutDetails?.targetMimeType
    ? { shortcutTargetMimeType: raw.shortcutDetails.targetMimeType }
    : {}),
})

/**
 * Google Drive v3 over plain fetch, read-only: only GET requests reach the Drive API (SC-005).
 * Access tokens are minted from each person's refresh token and kept in memory until they expire.
 */
export const createDriveFetchGateway = (options: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  retryDelayMs?: number
}): DriveGateway => {
  const http = options.fetch ?? fetch
  const baseDelay = options.retryDelayMs ?? 500
  const tokens = new Map<string, { value: string; expiresAt: number }>()

  const accessToken = async (refreshToken: string, force = false): Promise<string> => {
    const cached = tokens.get(refreshToken)
    if (!force && cached && cached.expiresAt > Date.now() + 30_000) return cached.value
    const response = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      error?: string
    }
    if (!response.ok || !body.access_token) {
      tokens.delete(refreshToken)
      if (body.error === 'invalid_grant' || response.status === 400 || response.status === 401)
        throw new DriveConnectionLost()
      throw new Error(`token refresh failed: ${response.status}`)
    }
    tokens.set(refreshToken, {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    })
    return body.access_token
  }

  /** GET with one token refresh on 401 and exponential backoff with jitter on rate limits. */
  const get = async (refreshToken: string, url: URL): Promise<Response> => {
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const response = await http(url, {
        headers: { authorization: `Bearer ${await accessToken(refreshToken)}` },
      })
      if (response.status === 401 && !refreshed) {
        refreshed = true
        await accessToken(refreshToken, true)
        continue
      }
      const rateLimited =
        response.status === 429 ||
        (response.status === 403 && (await isRateLimit(response.clone())))
      if (!rateLimited) return response
      // Still rate limited after the retries: Drive is unavailable, not "no access".
      if (attempt >= 5) throw new Error('drive rate limited')
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * 2 ** attempt * (0.5 + Math.random())),
      )
    }
  }

  return {
    getItem: async (refreshToken, id) => {
      const url = new URL(`${API}/files/${encodeURIComponent(id)}`)
      url.searchParams.set('fields', ITEM_FIELDS)
      url.searchParams.set('supportsAllDrives', 'true')
      const response = await get(refreshToken, url)
      // 404: unknown or not shared; 403 after the rate-limit retries: refused by Drive for this person.
      if (response.status === 404 || response.status === 403) return null
      if (response.status === 401) throw new DriveConnectionLost()
      if (!response.ok) throw new Error(`drive files.get failed: ${response.status}`)
      return toItem((await response.json()) as RawItem)
    },

    async *listChildren(refreshToken, parentIds, driveId) {
      let pageToken: string | undefined
      do {
        const url = new URL(`${API}/files`)
        const parents = parentIds
          // Drive query strings: escape backslashes first, then quotes.
          .map((id) => `'${id.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}' in parents`)
          .join(' or ')
        url.searchParams.set('q', `(${parents}) and trashed = false`)
        url.searchParams.set('pageSize', '1000')
        url.searchParams.set('fields', `nextPageToken,incompleteSearch,files(${ITEM_FIELDS})`)
        url.searchParams.set('supportsAllDrives', 'true')
        url.searchParams.set('includeItemsFromAllDrives', 'true')
        if (driveId) {
          url.searchParams.set('corpora', 'drive')
          url.searchParams.set('driveId', driveId)
        } else url.searchParams.set('corpora', 'user')
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const response = await get(refreshToken, url)
        if (response.status === 401) throw new DriveConnectionLost()
        if (response.status === 403 || response.status === 404) throw new DriveAccessDenied()
        if (!response.ok) throw new Error(`drive files.list failed: ${response.status}`)
        const body = (await response.json()) as {
          files?: RawItem[]
          nextPageToken?: string
          incompleteSearch?: boolean
        }
        if (body.incompleteSearch) throw new DriveIncompleteListing()
        yield (body.files ?? []).map(toItem)
        pageToken = body.nextPageToken
      } while (pageToken)
    },
  }
}

const isRateLimit = async (response: Response): Promise<boolean> => {
  const text = await response.text().catch(() => '')
  return /rateLimitExceeded|userRateLimitExceeded/.test(text)
}
