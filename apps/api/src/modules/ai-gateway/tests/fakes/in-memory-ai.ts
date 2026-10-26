import { fixedClock, newId } from '@goodresearch/shared'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import { makeProviderCommands } from '../../application/commands/provider-commands.ts'
import { makeGateway } from '../../application/gateway.ts'
import {
  type AiDeps,
  type AiStore,
  type GoogleCloudApi,
  type GoogleGrant,
  type ModelRunner,
  type OauthState,
  type PendingGrant,
  ProviderCallError,
  type StoredConnection,
  type UsageEntry,
} from '../../application/ports.ts'
import { makeProviderQueries } from '../../application/queries/provider-queries.ts'
import type { AiFailure } from '../../domain/failure.ts'
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
    setStatus: async (id, status, failure, checkedAt) => {
      const c = connections.get(id)
      if (c)
        connections.set(id, {
          ...c,
          status,
          lastFailure: failure,
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
    usageSummary: async (id) => {
      const mine = usage.filter((e) => e.accountId === id)
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
  const outcome = (credential: Credential) => {
    calls.push({ credential, model: '' })
    if (nextFailure) {
      const failure = nextFailure
      const billed = nextUsage
      nextFailure = null
      nextUsage = null
      throw new ProviderCallError(failure, billed)
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
    generateObject: async (credential, _model, request, timeoutMs) => {
      timeouts.push(timeoutMs)
      outcome(credential)
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
    failNext: (failure: AiFailure, usage?: { inputTokens: number; outputTokens: number }) => {
      nextFailure = failure
      nextUsage = usage ?? null
    },
  }
}

export const fakeGoogle = () => {
  const cloud = {
    state: 'enabled' as 'enabled' | 'disabled' | 'no-access' | 'not-found',
    predict: true as boolean | null,
    revokedGrant: false,
  }
  const oauth: GoogleGrant = {
    authorizationUrl: ({ state }) => `https://accounts.example.test/auth?state=${state}`,
    exchange: async ({ code }) => ({
      accessToken: `access-${code}`,
      refreshToken: `refresh-${code}`,
    }),
  }
  const api: GoogleCloudApi = {
    accessToken: async () => {
      if (cloud.revokedGrant) throw new ProviderCallError('INVALID_CREDENTIAL')
      return 'access'
    },
    apiState: async () => cloud.state,
    canPredict: async () => cloud.predict,
    accountEmail: async () => 'ada@example.org',
  }
  return { google: { oauth, cloud: api }, cloud }
}

export const aiWorld = (options: { offered?: ProviderKind[] } = {}) => {
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
      timeoutMs: 1000,
      prices: [],
    },
    clock,
    newId,
    log: { warn: () => {} },
  }
  const gateway = makeGateway(deps)
  return {
    deps,
    clock,
    ...memory,
    model,
    google: g,
    gateway,
    commands: makeProviderCommands(deps, gateway),
    queries: makeProviderQueries(deps),
  }
}
