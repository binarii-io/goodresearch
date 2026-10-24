import { createGoogleOAuth } from '#platform/google/oauth.ts'
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
  const google = createGoogleOAuth({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    redirectUri: new URL(DRIVE_CALLBACK_PATH, options.appUrl).toString(),
    fetch: http,
  })

  return {
    authorizationUrl: ({ state, codeChallenge, loginHint }) =>
      google.authorizationUrl({ scopes: [DRIVE_SCOPE], state, codeChallenge, loginHint }),

    exchange: async ({ code, codeVerifier }) => {
      const granted = await google.exchange({ code, codeVerifier, requiredScope: DRIVE_SCOPE })
      const about = await http(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
        { headers: { authorization: `Bearer ${granted.accessToken}` } },
      )
      const user = ((await about.json()) as { user?: { emailAddress?: string } }).user
      return {
        refreshToken: granted.refreshToken,
        externalAccount: user?.emailAddress ?? 'unknown',
      }
    },

    revoke: (refreshToken) => google.revoke(refreshToken),
  }
}
