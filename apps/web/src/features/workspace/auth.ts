/** Starts the OpenID Connect sign-in with a configured provider (the only way to sign in). */
export const signIn = async (provider: string, redirect: string): Promise<void> => {
  const response = await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, callbackURL: redirect, errorCallbackURL: '/sign-in' }),
  })
  if (!response.ok) throw new Error(`sign-in failed: ${response.status}`)
  const { url } = (await response.json()) as { url: string }
  window.location.assign(url)
}

export const signOut = async (): Promise<void> => {
  await fetch('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
}

/** Only same-origin paths are accepted as post-sign-in destinations (no open redirect). */
export const safeRedirect = (value: unknown): string =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
