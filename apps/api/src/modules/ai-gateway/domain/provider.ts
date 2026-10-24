export type ProviderKind = 'vertex' | 'anthropic' | 'openai' | 'fake'
export type ApiKeyProvider = Exclude<ProviderKind, 'vertex'>

/** Credentials as the gateway uses them, decrypted, never leaving the server. */
export type Credential =
  | { readonly provider: ApiKeyProvider; readonly apiKey: string }
  | {
      readonly provider: 'vertex'
      readonly refreshToken: string
      readonly project: string
      readonly region: string
    }

/** Shown instead of a key (FR-006). */
export const credentialHint = (apiKey: string): string => apiKey.slice(-4)

/** Google Cloud project ID rules: 6 to 30 characters, lower-case letters, digits and hyphens. */
export const isValidProjectId = (value: string): boolean =>
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)

/** Regions offered for Vertex AI; `global` first, as recent models are served there. */
export const VERTEX_REGIONS = [
  'global',
  'europe-west1',
  'europe-west4',
  'europe-west9',
  'us-central1',
  'us-east4',
  'asia-northeast1',
] as const
