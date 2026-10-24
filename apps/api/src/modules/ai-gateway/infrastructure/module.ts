import type { AppConfig } from '@goodresearch/config'
import { type Clock, newId } from '@goodresearch/shared'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import type { Db } from '#platform/db.ts'
import { createGoogleOAuth } from '#platform/google/oauth.ts'
import { makeProviderCommands } from '../application/commands/provider-commands.ts'
import { makeGateway } from '../application/gateway.ts'
import type { AiDeps, GoogleCloudApi, ModelRunner } from '../application/ports.ts'
import { makeProviderQueries } from '../application/queries/provider-queries.ts'
import { createAiStore } from './ai.drizzle-store.ts'
import { createAiSdkRunner } from './ai-sdk.model-runner.ts'
import { createGoogleCloudApi } from './google-cloud.fetch-api.ts'
import type { AiHandlers } from './http.routes.ts'

export const AI_GOOGLE_CALLBACK_PATH = '/api/ai-provider/google/callback'
/** Vertex AI has no narrower OAuth scope (plan, Complexity Tracking); email names the account. */
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const GRANT_SCOPES = [CLOUD_SCOPE, 'openid', 'email'] as const

/** Builds the AI Gateway module (spec 004). Runner and Google adapters can be replaced in tests. */
export const createAiGatewayModule = (deps: {
  db: Db
  clock: Clock
  config: Pick<AppConfig, 'appUrl' | 'authSecret' | 'google' | 'ai'>
  runner?: ModelRunner
  googleCloud?: GoogleCloudApi
  googleFetch?: typeof fetch
  log?: { warn(object: object, message: string): void }
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
            authorizationUrl: (input: { state: string; codeChallenge: string }) =>
              oauth.authorizationUrl({ ...input, scopes: GRANT_SCOPES }),
            exchange: (input: { code: string; codeVerifier: string }) =>
              oauth.exchange({ ...input, requiredScope: CLOUD_SCOPE }),
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
    runner: deps.runner ?? createAiSdkRunner({ google: config.google }),
    google,
    cipher: createTokenCipher(config.authSecret, CIPHER_PURPOSES.aiProviderCredentials),
    config: config.ai,
    clock: deps.clock,
    newId,
    log,
  }
  const gateway = makeGateway(ai)
  const commands = makeProviderCommands(ai, gateway)
  const queries = makeProviderQueries(ai)
  const handlers: AiHandlers = { commands, queries }
  return {
    handlers,
    /** For other modules: every AI call of a person goes through it (constitution IV). */
    gateway,
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
