import { fixedClock, newId } from '@goodresearch/shared'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import { makeProviderCommands } from '../../application/commands/provider-commands.ts'
import { makeGateway } from '../../application/gateway.ts'
import {
  type AiDeps,
  type AiStore,
  type GoogleCloudApi,
  type GoogleGrant,
  GrantScopeMissing,
  type ModelRunner,
  type OauthState,
  type PendingGrant,
  ProviderCallError,
  type StoredConnection,
  type UsageEntry,
} from '../../application/ports.ts'
import { makeProviderQueries } from '../../application/queries/provider-queries.ts'
import type { AiFailure } from '../../domain/failure.ts'
import type { GrantProblem } from '../../domain/grant-problem.ts'
import type { Credential, ProviderKind } from '../../domain/provider.ts'

export const inMemoryAiStore = () => {
  const connections = new Map<string, StoredConnection>()
  const grants = new Map<string, PendingGrant>()
  const states = new Map<string, OauthState>()
  const usage: UsageEntry[] = []
  const store: AiStore = {
    getConnection: async (id) => connections.get(id) ?? null,
    saveConnection: async (c) => {
      connections.set(c.accountId, c)
    },
    setStatus: async (id, status, failure, checkedAt, grantProblem = null) => {
      const c = connections.get(id)
      if (c)
        connections.set(id, {
          ...c,
          status,
          lastFailure: failure,
          grantProblem: status === 'needs-attention' ? grantProblem : null,
          ...(checkedAt ? { lastCheckedAt: checkedAt } : {}),
        })
    },
    deleteConnection: async (id) => {
      connections.delete(id)
    },
    savePendingGrant: async (g) => {
      grants.set(g.accountId, g)
    },
    getPendingGrant: async (id, now) => {
      const g = grants.get(id)
      return g && g.expiresAt > now ? g : null
    },
    deletePendingGrant: async (id) => {
      grants.delete(id)
    },
    saveOauthState: async (s) => {
      states.set(s.state, s)
    },
    takeOauthState: async (state, now) => {
      const s = states.get(state)
      states.delete(state)
      return s && s.expiresAt > now ? s : null
    },
    appendUsage: async (e) => {
      usage.push(e)
    },
    usageByRefs: async (id, refs) =>
      usage.filter((e) => e.accountId === id && e.ref !== null && refs.includes(e.ref)),
    usageByRefsAll: async (refs) => usage.filter((e) => e.ref !== null && refs.includes(e.ref)),
    usageSummary: async (id, shared) => {
      const mine = usage.filter(
        (e) => e.accountId === id && (shared === undefined || e.shared === shared),
      )
      return {
        calls: mine.length,
        inputTokens: mine.reduce((n, e) => n + (e.inputTokens ?? 0), 0),
        outputTokens: mine.reduce((n, e) => n + (e.outputTokens ?? 0), 0),
      }
    },
  }
  return { store, connections, grants, states, usage }
}

/** A model runner whose answer depends on the credential: `bad-*` keys fail with that reason. */
export const fakeRunner = () => {
  const calls: { credential: Credential; model: string }[] = []
  /** The time limit of each structured call (spec 010: long calls run in the worker). */
  const timeouts: number[] = []
  let nextFailure: AiFailure | null = null
  let nextUsage: { inputTokens: number; outputTokens: number } | null = null
  let nextProblem: GrantProblem | null = null
  const outcome = (credential: Credential, model = '') => {
    calls.push({ credential, model })
    if (nextFailure) {
      const failure = nextFailure
      const billed = nextUsage
      const problem = nextProblem
      nextFailure = null
      nextUsage = null
      nextProblem = null
      throw new ProviderCallError(failure, billed, problem)
    }
    if (credential.provider !== 'vertex' && credential.apiKey.startsWith('bad'))
      throw new ProviderCallError('INVALID_CREDENTIAL')
  }
  const usage = { inputTokens: 10, outputTokens: 2 }
  const runner: ModelRunner = {
    generateText: async (credential) => {
      outcome(credential)
      return { text: 'OK', usage }
    },
    generateObject: async (credential, model, request, timeoutMs) => {
      timeouts.push(timeoutMs)
      outcome(credential, model)
      return { object: request.schema.parse({ answer: 'yes' }), usage }
    },
    // Like the AI SDK: `done` settles only once the stream has been read to its end.
    stream: (credential) => {
      let settle: { resolve: (u: typeof usage) => void; reject: (e: unknown) => void } | undefined
      const done = new Promise<typeof usage>((resolve, reject) => {
        settle = { resolve, reject }
      })
      async function* streamParts() {
        try {
          outcome(credential)
        } catch (error) {
          settle?.reject(error)
          throw error
        }
        yield { type: 'text' as const, delta: 'O' }
        yield { type: 'text' as const, delta: 'K' }
        settle?.resolve(usage)
      }
      return { parts: streamParts(), done }
    },
  }
  return {
    runner,
    calls,
    timeouts,
    /** The next call fails; `usage`: tokens the provider still counted (an answer that did not fit). */
    failNext: (
      failure: AiFailure,
      usage?: { inputTokens: number; outputTokens: number },
      /** Spec 030: Google refused the grant for this reason. */
      grantProblem?: GrantProblem,
    ) => {
      nextFailure = failure
      nextUsage = usage ?? null
      nextProblem = grantProblem ?? null
    },
  }
}

export const fakeGoogle = () => {
  const cloud = {
    state: 'enabled' as 'enabled' | 'disabled' | 'no-access' | 'not-found',
    predict: true as boolean | null,
    /** `true` or a reason: Google refuses the grant (spec 030). */
    revokedGrant: false as boolean | Exclude<GrantProblem, 'unreadable'>,
    unreachable: false,
    email: 'ada@example.org',
  }
  const oauth: GoogleGrant = {
    authorizationUrl: ({ state, loginHint }) =>
      `https://accounts.example.test/auth?state=${state}${loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : ''}`,
    exchange: async ({ code }) => {
      if (code === 'no-scope') throw new GrantScopeMissing()
      if (code === 'boom') throw new Error('google consent exchange failed: 500')
      return { accessToken: `access-${code}`, refreshToken: `refresh-${code}` }
    },
  }
  const api: GoogleCloudApi = {
    accessToken: async () => {
      if (cloud.unreachable) throw new ProviderCallError('UNREACHABLE')
      if (cloud.revokedGrant)
        throw new ProviderCallError(
          'INVALID_CREDENTIAL',
          null,
          cloud.revokedGrant === true ? 'refused' : cloud.revokedGrant,
        )
      return 'access'
    },
    apiState: async () => cloud.state,
    canPredict: async () => cloud.predict,
    accountEmail: async () => cloud.email,
  }
  return { google: { oauth, cloud: api }, cloud }
}

export const aiWorld = (
  options: {
    offered?: ProviderKind[]
    /** Spec 035: the instance's shared provider. */
    shared?: NonNullable<AiDeps['config']['shared']>
    /** Spec 035: each account's teams. */
    teams?: Record<string, readonly string[]>
  } = {},
) => {
  const warnings: { object: object; message: string }[] = []
  const clock = fixedClock(new Date('2026-10-24T10:00:00Z'))
  const memory = inMemoryAiStore()
  const model = fakeRunner()
  const g = fakeGoogle()
  const deps: AiDeps = {
    store: memory.store,
    runner: model.runner,
    google: g.google,
    cipher: createTokenCipher(
      'test-secret-of-at-least-thirty-two-chars',
      CIPHER_PURPOSES.aiProviderCredentials,
    ),
    config: {
      offered: options.offered ?? ['vertex', 'anthropic', 'openai'],
      models: { vertex: 'v-model', anthropic: 'a-model', openai: 'o-model', fake: 'f' },
      strongModels: {
        vertex: 'v-strong',
        anthropic: 'a-model',
        openai: 'o-model',
        fake: 'f-strong',
      },
      timeoutMs: 1000,
      prices: [],
      shared: options.shared ?? null,
    },
    serviceAccessToken: async () => 'service-access',
    clock,
    newId,
    log: { warn: (object, message) => warnings.push({ object, message }) },
    teamIdsOf: async (accountId) => options.teams?.[accountId] ?? [],
  }
  const gateway = makeGateway(deps)
  return {
    deps,
    clock,
    ...memory,
    model,
    google: g,
    gateway,
    warnings,
    commands: makeProviderCommands(deps, gateway),
    queries: makeProviderQueries(deps),
  }
}
