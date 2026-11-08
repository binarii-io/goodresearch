import type { AppConfig, SharedAiProvider } from '@goodresearch/config'
import { type Clock, newId } from '@goodresearch/shared'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import type { Db } from '#platform/db.ts'
import { createGoogleOAuth, GoogleScopeNotGranted } from '#platform/google/oauth.ts'
import { makeProviderCommands } from '../application/commands/provider-commands.ts'
import { makeGateway } from '../application/gateway.ts'
import {
  type AiDeps,
  type GoogleCloudApi,
  GrantScopeMissing,
  type ModelRunner,
} from '../application/ports.ts'
import { makeProviderQueries } from '../application/queries/provider-queries.ts'
import {
  makeEstimateCost,
  makeStudyCosts,
  makeUsageCosts,
  priceCatalog,
} from '../application/queries/usage-costs.ts'
import type { Credential } from '../domain/provider.ts'
import { createAiStore } from './ai.drizzle-store.ts'
import { createAiSdkRunner } from './ai-sdk.model-runner.ts'
import { DEFAULT_PRICES } from './default-prices.ts'
import { createGoogleCloudApi } from './google-cloud.fetch-api.ts'
import { createServiceAccessToken } from './google-service-token.ts'
import type { AiHandlers } from './http.routes.ts'

export const AI_GOOGLE_CALLBACK_PATH = '/api/ai-provider/google/callback'
/** Vertex AI has no narrower OAuth scope (plan, Complexity Tracking); email names the account. */
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const GRANT_SCOPES = [CLOUD_SCOPE, 'openid', 'email'] as const

/** Builds the AI Gateway module (spec 004). Runner and Google adapters can be replaced in tests. */
/** Spec 035: the shared provider of the configuration as the gateway uses it. */
const sharedOf = (
  shared: SharedAiProvider | null,
  models: AppConfig['ai']['models'],
): AiDeps['config']['shared'] => {
  if (!shared) return null
  const credential: Credential =
    shared.provider === 'vertex'
      ? {
          provider: 'vertex',
          serviceAccount: shared.key ?? 'instance',
          project: shared.project,
          region: shared.region,
        }
      : { provider: shared.provider, apiKey: shared.apiKey }
  return { credential, model: models[shared.provider], teams: shared.teams }
}

export const createAiGatewayModule = (deps: {
  db: Db
  clock: Clock
  config: Pick<AppConfig, 'appUrl' | 'authSecret' | 'google' | 'ai'>
  runner?: ModelRunner
  googleCloud?: GoogleCloudApi
  googleFetch?: typeof fetch
  log?: { warn(object: object, message: string): void }
  /** Spec 035: an account's teams (Workspace), for a shared provider open to some teams. */
  teamIdsOf: (accountId: string) => Promise<readonly string[]>
}) => {
  const { config } = deps
  const oauth = config.google
    ? createGoogleOAuth({
        ...config.google,
        redirectUri: new URL(AI_GOOGLE_CALLBACK_PATH, config.appUrl).toString(),
        ...(deps.googleFetch ? { fetch: deps.googleFetch } : {}),
      })
    : null
  const google =
    config.google && oauth
      ? {
          oauth: {
            authorizationUrl: (input: {
              state: string
              codeChallenge: string
              loginHint?: string
            }) => oauth.authorizationUrl({ ...input, scopes: GRANT_SCOPES }),
            exchange: (input: { code: string; codeVerifier: string }) =>
              oauth.exchange({ ...input, requiredScope: CLOUD_SCOPE }).catch((error: unknown) => {
                throw error instanceof GoogleScopeNotGranted ? new GrantScopeMissing() : error
              }),
          },
          cloud:
            deps.googleCloud ??
            createGoogleCloudApi({
              ...config.google,
              ...(deps.googleFetch ? { fetch: deps.googleFetch } : {}),
            }),
        }
      : null
  const log = deps.log ?? console
  const ai: AiDeps = {
    store: createAiStore(deps.db),
    runner: deps.runner ?? createAiSdkRunner({ google: config.google, log }),
    serviceAccessToken: createServiceAccessToken(),
    google,
    cipher: createTokenCipher(config.authSecret, CIPHER_PURPOSES.aiProviderCredentials),
    config: {
      ...config.ai,
      prices: priceCatalog(DEFAULT_PRICES, config.ai.prices),
      shared: sharedOf(config.ai.shared, config.ai.models),
    },
    clock: deps.clock,
    newId,
    log,
    teamIdsOf: deps.teamIdsOf,
  }
  const gateway = makeGateway(ai)
  const commands = makeProviderCommands(ai, gateway)
  const queries = makeProviderQueries(ai)
  const usageCosts = makeUsageCosts(ai)
  const handlers: AiHandlers = { commands, queries }
  return {
    handlers,
    /** For other modules: every AI call of a person goes through it (constitution IV). */
    gateway,
    /** Cost in USD of the calls made for each ref (assistant messages). */
    usageCosts,
    /** The same for every account (the cost of a study's analyses, spec 009). */
    studyCosts: makeStudyCosts(ai),
    /** Spec 038: the kind of the provider serving a person (Vertex AI reads videos). */
    providerKindOf: gateway.providerOf,
    /** What a call would cost with the person's model today (spec 009 estimates). */
    estimateCost: makeEstimateCost(ai),
    /** For `Me` (workspace): is the provider step needed? */
    providerGate: queries.gate,
    /** Account deletion (spec 001 anonymisation, FR-013). */
    forgetAccount: async (accountId: string) => {
      // The account is already anonymised: a failure here must not turn the deletion into an error.
      await commands.removeProvider({ actor: { id: accountId } }).catch((error: unknown) => {
        log.warn(
          { err: error, accountId },
          'AI provider credentials of a deleted account not removed',
        )
      })
    },
  }
}
