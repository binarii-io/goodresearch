import { createGoogleOAuth } from '#platform/google/oauth.ts'
import type { DriveAuthorization } from '../domain/drive-gateway.ts'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
/** Edit the files the person can edit in Drive (spec 007); includes reading. */
export const DRIVE_WRITE_SCOPE = 'https://www.googleapis.com/auth/drive'
export const DRIVE_CALLBACK_PATH = '/api/sources/google-drive/callback'

/** Consent for Drive access, separate from sign-in (spec 002, spec 007, ADR-0005). */
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
    authorizationUrl: ({ state, codeChallenge, loginHint, access }) =>
      google.authorizationUrl({
        scopes: [access === 'write' ? DRIVE_WRITE_SCOPE : DRIVE_SCOPE],
        state,
        codeChallenge,
        loginHint,
      }),

    exchange: async ({ code, codeVerifier, access }) => {
      const granted = await google.exchange({
        code,
        codeVerifier,
        requiredScope: access === 'write' ? DRIVE_WRITE_SCOPE : DRIVE_SCOPE,
      })
      const about = await http(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
        { headers: { authorization: `Bearer ${granted.accessToken}` } },
      )
      const user = ((await about.json()) as { user?: { emailAddress?: string } }).user
      return {
        refreshToken: granted.refreshToken,
        externalAccount: user?.emailAddress ?? 'unknown',
        // A read consent may come back with editing already granted earlier (incremental).
        access: granted.scopes.includes(DRIVE_WRITE_SCOPE) ? 'write' : 'read',
      }
    },

    revoke: (refreshToken) => google.revoke(refreshToken),
  }
}
