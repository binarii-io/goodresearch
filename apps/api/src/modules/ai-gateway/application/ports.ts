import type { Clock } from '@goodresearch/shared'
import type { ZodType } from 'zod'
import type { AiFailure } from '../domain/failure.ts'
import type { GrantProblem } from '../domain/grant-problem.ts'
import type { Price } from '../domain/pricing.ts'
import type { Credential, ProviderKind } from '../domain/provider.ts'

export type Usage = { readonly inputTokens: number | null; readonly outputTokens: number | null }

export type ToolCall = { readonly id: string; readonly name: string; readonly input: unknown }

/** A conversation turn; tool calls and their results let the model see what the person decided. */
export type ChatMessage =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant'
      readonly content: string
      readonly toolCalls?: readonly ToolCall[]
    }
  | {
      readonly role: 'tool'
      readonly results: readonly {
        readonly id: string
        readonly name: string
        readonly output: string
      }[]
    }

/**
 * A tool the model may call. Tools have no execution here: a call ends the model's step and comes
 * back to the caller as a proposal (constitution IV, spec 005 research R2).
 */
export type ToolSpec = {
  readonly name: string
  readonly description: string
  readonly inputSchema: ZodType
  /**
   * Tools the app runs during the answer (reading instructions, checking texts): their output
   * goes back to the model, which goes on in the same answer. Without `run`, a call ends the
   * answer and is returned to the caller (a proposal).
   */
  readonly run?: (input: unknown, call: { readonly id: string }) => Promise<string>
}

/** Model steps of one answer at most (tool runs in between). */
export const MAX_STEPS = 6

/**
 * Spec 038: a part of the user turn: text, a file the provider reads by its URI (a video in a
 * staging bucket, with an optional part of it), or an image sent inline.
 */
export type RequestPart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'file'
      readonly uri: string
      readonly mimeType: string
      readonly startMs?: number
      readonly endMs?: number
    }
  | { readonly type: 'image'; readonly data: Uint8Array; readonly mimeType: 'image/jpeg' }

/** Spec 038: the standard model of a provider, or its strong one for heavier steps. */
export type ModelTier = 'standard' | 'strong'

/** The text of a request, for adapters and fakes that read it: the prompt, else its text parts. */
export const requestText = (request: ModelRequest): string =>
  request.prompt ??
  (request.parts ?? []).flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n')

/** What a task asks the model; the prompt and the answer are never stored by the gateway (FR-010). */
export type ModelRequest = {
  readonly system?: string
  readonly prompt?: string
  /** Spec 038: the user turn as parts (text, files, images), instead of `prompt`. */
  readonly parts?: readonly RequestPart[]
  readonly messages?: readonly ChatMessage[]
  readonly tools?: readonly ToolSpec[]
  readonly maxOutputTokens?: number
}

/** What a streamed call produces: text as it is written, and tool calls. */
export type StreamPart =
  | { readonly type: 'text'; readonly delta: string }
  | { readonly type: 'tool-call'; readonly call: ToolCall }

/** The classified reason of any error thrown by a provider call. */
export const failureOf = (error: unknown): AiFailure =>
  error instanceof ProviderCallError ? error.failure : 'UNKNOWN'

/**
 * A call the provider answered, but not usefully: tokens were counted, or the answer was cut or
 * out of form. Modules show it as an invalid answer, not as the AI being unavailable.
 */
export const isInvalidAnswer = (error: ProviderCallError) =>
  error.usage !== null || error.failure === 'ANSWER_INCOMPLETE'

/** A provider call that failed for a classified reason (research R4). */
export class ProviderCallError extends Error {
  override name = 'ProviderCallError'
  readonly failure: AiFailure
  /** Tokens the provider counted before the call failed (an answer that does not fit): billed. */
  readonly usage: Usage | null
  /** Spec 030: Google refused the person's grant (only with `INVALID_CREDENTIAL`). */
  readonly grantProblem: GrantProblem | null
  /** The answer stopped at the output limit (only with `ANSWER_INCOMPLETE`): a larger one may fit. */
  readonly cut: boolean
  constructor(
    failure: AiFailure,
    usage: Usage | null = null,
    grantProblem: GrantProblem | null = null,
    cut = false,
  ) {
    super(`provider call failed: ${failure}`)
    this.failure = failure
    this.usage = usage
    this.grantProblem = grantProblem
    this.cut = cut
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
  stream(
    credential: Credential,
    model: string,
    request: ModelRequest,
    timeoutMs: number,
  ): { parts: AsyncIterable<StreamPart>; done: Promise<Usage> }
}

/**
 * The consent that lets goodresearch call Vertex AI with the person's own Google account (scopes
 * and URLs live in the adapter). There is no revoke here: Google revokes a whole app grant at once,
 * which would also cut the new token and Google Drive (spec 004 FR-008, research R2).
 */
export interface GoogleGrant {
  /** `loginHint`: the saved Google account, when reconnecting (spec 030). */
  authorizationUrl(input: { state: string; codeChallenge: string; loginHint?: string }): string
  /** Throws `GrantScopeMissing` when the person unticked the needed right. */
  exchange(input: {
    code: string
    codeVerifier: string
  }): Promise<{ accessToken: string; refreshToken: string }>
}

/** The person unticked the needed right on Google's screen (granular consent). */
export class GrantScopeMissing extends Error {
  override name = 'GrantScopeMissing'
  constructor() {
    super('google scope not granted')
  }
}

/** Google Cloud calls of the Vertex AI checklist (research R3), with the person's access. */
export interface GoogleCloudApi {
  /**
   * Throws `ProviderCallError('INVALID_CREDENTIAL')` with its grant problem when Google refuses the
   * grant, `ProviderCallError('UNREACHABLE')` otherwise.
   */
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
  /** Spec 030: set with `needs-attention` when Google refuses the Vertex AI grant. */
  readonly grantProblem: GrantProblem | null
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
  /** `reconnect` (spec 030): the saved project and region are checked again, no form. */
  readonly mode: 'setup' | 'reconnect'
  /** Started in a pop-up window: the callback ends on `/google/done`. */
  readonly popup: boolean
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
  /** What the call was for (e.g. an assistant message id), to sum costs per conversation. */
  readonly ref: string | null
  /** Spec 035: served by the instance's shared provider, not the person's own. */
  readonly shared: boolean
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
    /** Spec 030: kept with `needs-attention`, cleared otherwise. */
    grantProblem?: GrantProblem | null,
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
  /** `shared`: only the calls the instance's shared provider served (spec 035). */
  usageSummary(
    accountId: string,
    shared?: boolean,
  ): Promise<{ calls: number; inputTokens: number; outputTokens: number }>
  /** The person's entries made for these refs. */
  usageByRefs(accountId: string, refs: readonly string[]): Promise<UsageEntry[]>
  /** Everyone's entries made for these refs (the costs of a study's work, spec 009). */
  usageByRefsAll(refs: readonly string[]): Promise<UsageEntry[]>
}

export type AiDeps = {
  readonly store: AiStore
  readonly runner: ModelRunner
  /**
   * Spec 038: a short-lived Google access token for the instance's shared Vertex AI (its service
   * account or its own identity), for the video analysis's staging bucket. Absent in tests.
   */
  readonly serviceAccessToken?: (
    credential: Extract<Credential, { serviceAccount: unknown }>,
  ) => Promise<string>
  /** Null when no Google client is configured: Vertex AI is not offered then. */
  readonly google: { readonly oauth: GoogleGrant; readonly cloud: GoogleCloudApi } | null
  readonly cipher: {
    encrypt(clear: string, owner: string): string
    decrypt(stored: string, owner: string): string
  }
  readonly config: {
    readonly offered: readonly ProviderKind[]
    readonly models: Readonly<Record<ProviderKind, string>>
    /** Spec 038: the strong tier of each provider. */
    readonly strongModels: Readonly<Record<ProviderKind, string>>
    readonly timeoutMs: number
    /** Deployer prices, added to or replacing the built-in dated catalog. */
    readonly prices: readonly Price[]
    /**
     * Spec 035: the instance's shared provider, for people without their own; `teams`: the teams
     * it is open to, `null` for everyone with access. Its credential never leaves the server.
     */
    readonly shared: {
      readonly credential: Credential
      readonly model: string
      readonly teams: readonly string[] | null
    } | null
  }
  readonly clock: Clock
  readonly newId: () => string
  readonly log: { warn(object: object, message: string): void }
  /** Spec 035: the teams an account belongs to (Workspace), for a shared provider limited to some. */
  readonly teamIdsOf: (accountId: string) => Promise<readonly string[]>
}

/** Spec 035: whether the instance's shared provider serves this person. */
export const sharedOpenTo = async (
  deps: Pick<AiDeps, 'config' | 'teamIdsOf'>,
  accountId: string,
): Promise<boolean> => {
  const shared = deps.config.shared
  if (!shared) return false
  if (!shared.teams) return true
  const teams = shared.teams
  return (await deps.teamIdsOf(accountId)).some((t) => teams.includes(t))
}

/**
 * Spec 035: what serves a person's calls — their own connection while its provider is offered
 * (even when it needs attention: never a silent switch), else the instance's shared provider when
 * it is open to them, else nothing. The one place this order is written. `loaded`: the connection
 * already read by the caller.
 */
export type Serving =
  | {
      readonly kind: 'own'
      readonly connection: StoredConnection
      readonly provider: ProviderKind
      readonly model: string
    }
  | {
      readonly kind: 'shared'
      readonly credential: Credential
      readonly provider: ProviderKind
      readonly model: string
    }

export const servingOf = async (
  deps: Pick<AiDeps, 'store' | 'config' | 'teamIdsOf'>,
  accountId: string,
  loaded?: StoredConnection | null,
): Promise<Serving | null> => {
  const connection = loaded === undefined ? await deps.store.getConnection(accountId) : loaded
  if (connection && deps.config.offered.includes(connection.provider))
    return {
      kind: 'own',
      connection,
      provider: connection.provider,
      model: deps.config.models[connection.provider],
    }
  const shared = deps.config.shared
  if (shared && (await sharedOpenTo(deps, accountId)))
    return {
      kind: 'shared',
      credential: shared.credential,
      provider: shared.credential.provider,
      model: shared.model,
    }
  return null
}
