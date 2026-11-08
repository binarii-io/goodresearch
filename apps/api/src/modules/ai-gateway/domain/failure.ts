/** Why a provider call or check failed (spec 004 research R4); the app holds the texts. */
export type AiFailure =
  | 'INVALID_CREDENTIAL'
  | 'PERMISSION_DENIED'
  | 'NO_CREDIT_OR_QUOTA'
  | 'RATE_LIMITED'
  | 'MODEL_UNAVAILABLE'
  | 'API_DISABLED'
  | 'PROJECT_NOT_FOUND'
  | 'UNREACHABLE'
  | 'UNKNOWN'
  /** Spec 035: the instance's shared provider refused the call; only the deployer can fix it. */
  | 'SHARED_PROVIDER_UNAVAILABLE'
  /** Spec 038: the provider cannot read the files (video) sent with the request. */
  | 'MEDIA_NOT_SUPPORTED'
  /**
   * The provider answered, but not with the object asked for: cut by the output limit, or out of
   * form. Not the provider being unavailable: trying again usually works.
   */
  | 'ANSWER_INCOMPLETE'

/**
 * What an adapter saw, reduced to what classification needs. `message` and `code` are read here
 * only: they are never stored or shown (they may echo a credential).
 */
export type ProviderErrorFacts =
  | { kind: 'http'; status: number; code?: string | undefined; message?: string | undefined }
  | { kind: 'timeout' | 'network' | 'revoked-grant' | 'other' }

const QUOTA_CODES = ['insufficient_quota', 'billing_hard_limit_reached']

export const classifyFailure = (facts: ProviderErrorFacts): AiFailure => {
  if (facts.kind !== 'http')
    return facts.kind === 'revoked-grant'
      ? 'INVALID_CREDENTIAL'
      : facts.kind === 'other'
        ? 'UNKNOWN'
        : 'UNREACHABLE'
  const message = facts.message?.toLowerCase() ?? ''
  const code = facts.code ?? ''
  if (facts.status >= 500) return 'UNREACHABLE'
  if (facts.status === 401) return 'INVALID_CREDENTIAL'
  if (facts.status === 402 || QUOTA_CODES.includes(code) || message.includes('credit balance'))
    return 'NO_CREDIT_OR_QUOTA'
  if (facts.status === 403)
    return code === 'SERVICE_DISABLED' ||
      message.includes('has not been used') ||
      message.includes('is disabled')
      ? 'API_DISABLED'
      : 'PERMISSION_DENIED'
  if (facts.status === 404) return 'MODEL_UNAVAILABLE'
  if (facts.status === 429) return 'RATE_LIMITED'
  return 'UNKNOWN'
}

/** Failures only the person can fix: the connection then needs attention (FR-009). */
export const isAuthorisationFailure = (failure: AiFailure): boolean =>
  failure === 'INVALID_CREDENTIAL' || failure === 'PERMISSION_DENIED' || failure === 'API_DISABLED'

/** Spec 035: failures of the shared provider only the deployer can fix (credentials, quota, API). */
export const isDeployerFailure = (failure: AiFailure): boolean =>
  isAuthorisationFailure(failure) ||
  failure === 'NO_CREDIT_OR_QUOTA' ||
  failure === 'PROJECT_NOT_FOUND' ||
  failure === 'MODEL_UNAVAILABLE'
