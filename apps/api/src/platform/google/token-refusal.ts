/**
 * Why Google refused to mint an access token from a stored grant (spec 030 research R1).
 * `reauth-required`: the person's organisation asks them to sign in to Google again
 * (`invalid_rapt`); `refused`: the grant was withdrawn or has expired.
 */
export type TokenRefusal = 'refused' | 'reauth-required'

type TokenAnswer = {
  status: number
  /** The token endpoint's JSON body, or null when it was not JSON. */
  body: unknown
}

const field = (body: unknown, key: string): string =>
  body && typeof body === 'object' && typeof (body as Record<string, unknown>)[key] === 'string'
    ? ((body as Record<string, unknown>)[key] as string)
    : ''

/**
 * `null` when the answer is not about the grant (an outage, a rate limit, a client
 * misconfiguration): only a refused grant asks the person to reconnect.
 */
export const classifyTokenRefusal = ({ status, body }: TokenAnswer): TokenRefusal | null => {
  const error = field(body, 'error')
  if (error === 'invalid_grant') {
    const subtype = field(body, 'error_subtype')
    const description = field(body, 'error_description').toLowerCase()
    return subtype === 'invalid_rapt' ||
      description.includes('invalid_rapt') ||
      description.includes('reauth')
      ? 'reauth-required'
      : 'refused'
  }
  // A refusal without a readable reason still means the grant is unusable.
  if ((status === 400 || status === 401) && error === '') return 'refused'
  return null
}
