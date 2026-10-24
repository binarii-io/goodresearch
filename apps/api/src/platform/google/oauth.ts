/**
 * Google OAuth for consents that are separate from sign-in (Drive in spec 002, Vertex AI in spec
 * 004): code flow with PKCE, offline access, one scope set per consent, revocable on its own.
 */
export type GoogleOAuth = {
  authorizationUrl(input: {
    scopes: readonly string[]
    state: string
    codeChallenge: string
    loginHint?: string | undefined
  }): string
  /** Exchanges the code; fails when Google returned no refresh token or `requiredScope` was unticked. */
  exchange(input: {
    code: string
    codeVerifier: string
    requiredScope: string
  }): Promise<{ accessToken: string; refreshToken: string; scopes: readonly string[] }>
  revoke(token: string): Promise<void>
}

export const createGoogleOAuth = (options: {
  clientId: string
  clientSecret: string
  redirectUri: string
  fetch?: typeof fetch
}): GoogleOAuth => {
  const http = options.fetch ?? fetch
  return {
    authorizationUrl: ({ scopes, state, codeChallenge, loginHint }) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
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

    exchange: async ({ code, codeVerifier, requiredScope }) => {
      const response = await http('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: codeVerifier,
          redirect_uri: options.redirectUri,
          client_id: options.clientId,
          client_secret: options.clientSecret,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        access_token?: string
        refresh_token?: string
        scope?: string
      }
      if (!response.ok || !body.access_token || !body.refresh_token)
        throw new Error(`google consent exchange failed: ${response.status}`)
      const scopes = body.scope?.split(' ') ?? []
      // People can untick scopes on Google's screen (granular consent).
      if (!scopes.includes(requiredScope)) throw new Error('google scope not granted')
      return { accessToken: body.access_token, refreshToken: body.refresh_token, scopes }
    },

    revoke: async (token) => {
      await http('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      })
    },
  }
}
