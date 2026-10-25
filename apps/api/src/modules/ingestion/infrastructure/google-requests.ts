import { DriveConnectionLost } from '../domain/drive-gateway.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const isRateLimit = async (response: Response): Promise<boolean> => {
  const text = await response.text().catch(() => '')
  return /rateLimitExceeded|userRateLimitExceeded/.test(text)
}

/**
 * Requests to Google APIs with one person's refresh token: access tokens are minted and kept in
 * memory until they expire, refreshed once on 401, and rate limits are retried with exponential
 * backoff and jitter (spec 002, spec 007).
 */
export const createGoogleRequests = (options: {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  retryDelayMs?: number
}) => {
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

  /** One request; `json` is sent as the body. */
  const request = async (
    refreshToken: string,
    url: URL,
    init: { method?: string; json?: unknown } = {},
  ): Promise<Response> => {
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const response = await http(url, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${await accessToken(refreshToken)}`,
          ...(init.json === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.json === undefined ? {} : { body: JSON.stringify(init.json) }),
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
      // Still rate limited after the retries: the source is unavailable, not "no access".
      if (attempt >= 5) throw new Error('google rate limited')
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * 2 ** attempt * (0.5 + Math.random())),
      )
    }
  }

  return { request }
}

export type GoogleRequests = ReturnType<typeof createGoogleRequests>
