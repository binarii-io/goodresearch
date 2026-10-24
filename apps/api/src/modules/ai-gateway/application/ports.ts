import type { Clock } from '@goodresearch/shared'
import type { ZodType } from 'zod'
import type { AiFailure } from '../domain/failure.ts'
import type { Credential, ProviderKind } from '../domain/provider.ts'

export type Usage = { readonly inputTokens: number | null; readonly outputTokens: number | null }

export type ChatMessage = { readonly role: 'user' | 'assistant'; readonly content: string }

/** What a task asks the model; the prompt and the answer are never stored (FR-010). */
export type ModelRequest = {
  readonly system?: string
  readonly prompt?: string
  readonly messages?: readonly ChatMessage[]
  readonly maxOutputTokens?: number
}

/** The classified reason of any error thrown by a provider call. */
export const failureOf = (error: unknown): AiFailure =>
  error instanceof ProviderCallError ? error.failure : 'UNKNOWN'

/** A provider call that failed for a classified reason (research R4). */
export class ProviderCallError extends Error {
  override name = 'ProviderCallError'
  readonly failure: AiFailure
  constructor(failure: AiFailure) {
    super(`provider call failed: ${failure}`)
    this.failure = failure
  }
}

/** Runs one model call with a person's credential (AI SDK in production, a fake in tests). */
export interface ModelRunner {
  generateText(
    credential: Credential,
    model: string,
    request: ModelRequest,
    timeoutMs: number,
  ): Promise<{ text: string; usage: Usage }>
  generateObject<T>(
    credential: Credential,
    model: string,
    request: ModelRequest & { schema: ZodType<T> },
    timeoutMs: number,
  ): Promise<{ object: T; usage: Usage }>
  streamText(
    credential: Credential,
    model: string,
    request: ModelRequest,
    timeoutMs: number,
  ): { textStream: AsyncIterable<string>; done: Promise<Usage> }
}

/**
 * The consent that lets goodresearch call Vertex AI with the person's own Google account (scopes
 * and URLs live in the adapter). There is no revoke here: Google revokes a whole app grant at once,
 * which would also cut the new token and Google Drive (spec 004 FR-008, research R2).
 */
export interface GoogleGrant {
  authorizationUrl(input: { state: string; codeChallenge: string }): string
  exchange(input: {
    code: string
    codeVerifier: string
  }): Promise<{ accessToken: string; refreshToken: string }>
}

/** Google Cloud calls of the Vertex AI checklist (research R3), with the person's access. */
export interface GoogleCloudApi {
  /** Throws `ProviderCallError('INVALID_CREDENTIAL')` when the grant was revoked. */
  accessToken(refreshToken: string): Promise<string>
  apiState(
    accessToken: string,
    project: string,
  ): Promise<'enabled' | 'disabled' | 'no-access' | 'not-found'>
  /** `null` when it cannot be verified. */
  canPredict(accessToken: string, project: string): Promise<boolean | null>
  accountEmail(accessToken: string): Promise<string | null>
}

export type ConnectionStatus = 'working' | 'needs-attention'

export type StoredConnection = {
  readonly accountId: string
  readonly provider: ProviderKind
  readonly model: string
  readonly encryptedCredential: string
  readonly credentialHint: string | null
  readonly googleAccount: string | null
  readonly project: string | null
  readonly region: string | null
  readonly status: ConnectionStatus
  readonly lastFailure: AiFailure | null
  readonly lastCheckedAt: Date
}

export type PendingGrant = {
  readonly accountId: string
  readonly encryptedRefreshToken: string
  readonly googleAccount: string | null
  readonly expiresAt: Date
}

export type OauthState = {
  readonly state: string
  readonly accountId: string
  readonly codeVerifier: string
  readonly returnTo: string
  readonly expiresAt: Date
}

export type UsageEntry = {
  readonly id: string
  readonly accountId: string
  readonly task: string
  readonly provider: ProviderKind
  readonly model: string
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly durationMs: number
  /** `cancelled`: the caller stopped reading a stream before its end. */
  readonly outcome: 'success' | 'cancelled' | AiFailure
  readonly createdAt: Date
}

/** Persistence of the AI Gateway (Drizzle in production, in memory in use-case tests). */
export interface AiStore {
  getConnection(accountId: string): Promise<StoredConnection | null>
  /** Creates or replaces the person's connection. */
  saveConnection(connection: StoredConnection): Promise<void>
  setStatus(
    accountId: string,
    status: ConnectionStatus,
    failure: AiFailure | null,
    checkedAt: Date | null,
  ): Promise<void>
  deleteConnection(accountId: string): Promise<void>
  savePendingGrant(grant: PendingGrant): Promise<void>
  /** Null when absent or expired. */
  getPendingGrant(accountId: string, now: Date): Promise<PendingGrant | null>
  deletePendingGrant(accountId: string): Promise<void>
  /** Also purges expired states. */
  saveOauthState(state: OauthState, now: Date): Promise<void>
  /** Returns and deletes the state, or null if unknown or expired. */
  takeOauthState(state: string, now: Date): Promise<OauthState | null>
  appendUsage(entry: UsageEntry): Promise<void>
  usageSummary(
    accountId: string,
  ): Promise<{ calls: number; inputTokens: number; outputTokens: number }>
}

export type AiDeps = {
  readonly store: AiStore
  readonly runner: ModelRunner
  /** Null when no Google client is configured: Vertex AI is not offered then. */
  readonly google: { readonly oauth: GoogleGrant; readonly cloud: GoogleCloudApi } | null
  readonly cipher: {
    encrypt(clear: string, owner: string): string
    decrypt(stored: string, owner: string): string
  }
  readonly config: {
    readonly offered: readonly ProviderKind[]
    readonly models: Readonly<Record<ProviderKind, string>>
    readonly timeoutMs: number
  }
  readonly clock: Clock
  readonly newId: () => string
  readonly log: { warn(object: object, message: string): void }
}
