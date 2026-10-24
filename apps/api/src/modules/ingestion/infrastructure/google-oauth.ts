import type { DriveAuthorization } from '../domain/drive-gateway.ts'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
export const DRIVE_CALLBACK_PATH = '/api/sources/google-drive/callback'

/** Consent for read-only Drive access, separate from sign-in (spec 002, ADR-0005). */
export const createGoogleDriveAuthorization = (options: {
  clientId: string
  clientSecret: string
  appUrl: URL
  fetch?: typeof fetch
}): DriveAuthorization => {
  const http = options.fetch ?? fetch
  const redirectUri = new URL(DRIVE_CALLBACK_PATH, options.appUrl).toString()

  return {
    authorizationUrl: ({ state, codeChallenge, loginHint }) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: DRIVE_SCOPE,
        // A refresh token is only returned with offline access and an explicit consent.
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        ...(loginHint ? { login_hint: loginHint } : {}),
      }).toString()
      return url.toString()
    },

    exchange: async ({ code, codeVerifier }) => {
      const response = await http('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          client_id: options.clientId,
          client_secret: options.clientSecret,
        }),
      })
      const body = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        scope?: string
      }
      if (!response.ok || !body.access_token || !body.refresh_token)
        throw new Error(`drive consent exchange failed: ${response.status}`)
      // People can untick scopes on Google's screen (granular consent).
      if (!body.scope?.split(' ').includes(DRIVE_SCOPE)) throw new Error('drive scope not granted')
      const about = await http(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
        {
          headers: { authorization: `Bearer ${body.access_token}` },
        },
      )
      const user = ((await about.json()) as { user?: { emailAddress?: string } }).user
      return { refreshToken: body.refresh_token, externalAccount: user?.emailAddress ?? 'unknown' }
    },

    revoke: async (refreshToken) => {
      await http('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      })
    },
  }
}
