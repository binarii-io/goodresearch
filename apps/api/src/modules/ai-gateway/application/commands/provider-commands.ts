import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result, safeReturnPath } from '@goodresearch/shared'
import type { AiFailure } from '../../domain/failure.ts'
import {
  type ApiKeyProvider,
  type Credential,
  credentialHint,
  isValidProjectId,
  VERTEX_REGIONS,
} from '../../domain/provider.ts'
import { AiProviderRequired, type Gateway } from '../gateway.ts'
import { type AiDeps, failureOf, type StoredConnection } from '../ports.ts'

const STATE_TTL_MS = 10 * 60 * 1000
const PENDING_GRANT_TTL_MS = 60 * 60 * 1000

export type ProviderError =
  | 'AI_PROVIDER_NOT_OFFERED'
  | 'AI_CHECK_FAILED'
  | 'AI_PROVIDER_REQUIRED'
  | 'GOOGLE_NOT_CONFIGURED'
  | 'GOOGLE_GRANT_REQUIRED'
  | 'VALIDATION'

export type VertexCheck = {
  key: 'format' | 'api' | 'permission' | 'call'
  status: 'ok' | 'error' | 'skipped' | 'unknown'
  failure: AiFailure | null
}

/** Provider connection commands (spec 004 US1–US3). */
export const makeProviderCommands = (deps: AiDeps, gateway: Gateway) => {
  const now = () => deps.clock.now()

  const save = async (connection: StoredConnection) => {
    await deps.store.saveConnection(connection)
    return connection
  }

  return {
    connectApiKey: async (c: {
      actor: { id: string }
      provider: ApiKeyProvider
      apiKey: string
    }): Promise<Result<StoredConnection, ProviderError>> => {
      if (!deps.config.offered.includes(c.provider)) return err('AI_PROVIDER_NOT_OFFERED')
      const apiKey = c.apiKey.trim()
      const credential: Credential = { provider: c.provider, apiKey }
      const model = deps.config.models[c.provider]
      try {
        await gateway.check(c.actor.id, credential, model)
      } catch (error) {
        return err('AI_CHECK_FAILED', { failure: failureOf(error) })
      }
      return ok(
        await save({
          accountId: c.actor.id,
          provider: c.provider,
          model,
          encryptedCredential: deps.cipher.encrypt(apiKey, c.actor.id),
          credentialHint: credentialHint(apiKey),
          googleAccount: null,
          project: null,
          region: null,
          status: 'working',
          lastFailure: null,
          lastCheckedAt: now(),
        }),
      )
    },

    /** FR-005: the Google consent is separate from sign-in and from Drive. */
    startGoogleGrant: async (c: {
      actor: { id: string }
      returnTo: string
    }): Promise<Result<{ url: string }, ProviderError>> => {
      if (!deps.google) return err('GOOGLE_NOT_CONFIGURED')
      if (!deps.config.offered.includes('vertex')) return err('AI_PROVIDER_NOT_OFFERED')
      const state = randomBytes(24).toString('base64url')
      const codeVerifier = randomBytes(48).toString('base64url')
      await deps.store.saveOauthState(
        {
          state,
          accountId: c.actor.id,
          codeVerifier,
          returnTo: safeReturnPath(c.returnTo),
          expiresAt: new Date(now().getTime() + STATE_TTL_MS),
        },
        now(),
      )
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      return ok({
        url: deps.google.oauth.authorizationUrl({ state, codeChallenge }),
      })
    },

    /** The state is single-use, expires after 10 minutes and must belong to the signed-in person. */
    completeGoogleGrant: async (c: {
      actor: { id: string }
      state: string
      code: string
    }): Promise<Result<{ returnTo: string }, ProviderError>> => {
      if (!deps.google) return err('GOOGLE_NOT_CONFIGURED')
      const saved = await deps.store.takeOauthState(c.state, now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      const granted = await deps.google.oauth.exchange({
        code: c.code,
        codeVerifier: saved.codeVerifier,
      })
      await deps.store.savePendingGrant({
        accountId: c.actor.id,
        encryptedRefreshToken: deps.cipher.encrypt(granted.refreshToken, c.actor.id),
        googleAccount: await deps.google.cloud.accountEmail(granted.accessToken).catch(() => null),
        expiresAt: new Date(now().getTime() + PENDING_GRANT_TTL_MS),
      })
      return ok({ returnTo: saved.returnTo })
    },

    /**
     * Research R3: format, project access and API, permission (not blocking), real call. Uses the
     * pending grant, or the saved Vertex AI grant (to change the project or region).
     */
    checkVertex: async (c: {
      actor: { id: string }
      project: string
      region: string
    }): Promise<
      Result<{ checks: VertexCheck[]; connection: StoredConnection | null }, ProviderError>
    > => {
      if (!deps.google) return err('GOOGLE_NOT_CONFIGURED')
      if (!deps.config.offered.includes('vertex')) return err('AI_PROVIDER_NOT_OFFERED')
      if (!(VERTEX_REGIONS as readonly string[]).includes(c.region)) return err('VALIDATION')
      const accountId = c.actor.id
      const pending = await deps.store.getPendingGrant(accountId, now())
      const current = await deps.store.getConnection(accountId)
      const source = pending
        ? { encrypted: pending.encryptedRefreshToken, googleAccount: pending.googleAccount }
        : current?.provider === 'vertex'
          ? { encrypted: current.encryptedCredential, googleAccount: current.googleAccount }
          : null
      if (!source) return err('GOOGLE_GRANT_REQUIRED')
      let refreshToken: string
      try {
        refreshToken = deps.cipher.decrypt(source.encrypted, accountId)
      } catch {
        return err('GOOGLE_GRANT_REQUIRED')
      }

      const project = c.project.trim()
      const checks: VertexCheck[] = []
      const finish = (connection: StoredConnection | null) => {
        const order: VertexCheck['key'][] = ['format', 'api', 'permission', 'call']
        for (const key of order)
          if (!checks.some((check) => check.key === key))
            checks.push({ key, status: 'skipped', failure: null })
        return ok({ checks, connection })
      }

      if (!isValidProjectId(project)) {
        checks.push({ key: 'format', status: 'error', failure: null })
        return finish(null)
      }
      checks.push({ key: 'format', status: 'ok', failure: null })

      let accessToken: string
      try {
        accessToken = await deps.google.cloud.accessToken(refreshToken)
      } catch (error) {
        checks.push({ key: 'api', status: 'error', failure: failureOf(error) })
        return finish(null)
      }
      const state = await deps.google.cloud.apiState(accessToken, project).catch(() => null)
      const apiFailure: AiFailure | null =
        state === 'enabled'
          ? null
          : state === 'disabled'
            ? 'API_DISABLED'
            : state === 'not-found'
              ? 'PROJECT_NOT_FOUND'
              : state === 'no-access'
                ? null
                : 'UNREACHABLE'
      if (state === 'no-access') {
        // Service Usage also refuses people who may call models without reading the project's
        // services: not blocking, the real call decides (prototype rule).
        checks.push({ key: 'api', status: 'unknown', failure: null })
      } else {
        checks.push({ key: 'api', status: apiFailure ? 'error' : 'ok', failure: apiFailure })
        if (apiFailure) return finish(null)
      }

      const allowed = await deps.google.cloud.canPredict(accessToken, project).catch(() => null)
      // Not blocking: the real call decides (prototype rule).
      checks.push({
        key: 'permission',
        status: allowed === null ? 'unknown' : allowed ? 'ok' : 'error',
        failure: allowed === false ? 'PERMISSION_DENIED' : null,
      })

      const credential: Credential = { provider: 'vertex', refreshToken, project, region: c.region }
      const model = deps.config.models.vertex
      try {
        await gateway.check(accountId, credential, model)
      } catch (error) {
        checks.push({ key: 'call', status: 'error', failure: failureOf(error) })
        return finish(null)
      }
      checks.push({ key: 'call', status: 'ok', failure: null })

      const connection = await save({
        accountId,
        provider: 'vertex',
        model,
        encryptedCredential: deps.cipher.encrypt(refreshToken, accountId),
        credentialHint: null,
        googleAccount: source.googleAccount,
        project,
        region: c.region,
        status: 'working',
        lastFailure: null,
        lastCheckedAt: now(),
      })
      await deps.store.deletePendingGrant(accountId)
      return finish(connection)
    },

    /** US3: a success brings the connection back to working, an authorisation failure flags it. */
    testProvider: async (c: {
      actor: { id: string }
    }): Promise<Result<{ ok: boolean; failure: AiFailure | null }, ProviderError>> => {
      const connection = await deps.store.getConnection(c.actor.id)
      if (!connection || !deps.config.offered.includes(connection.provider))
        return err('AI_PROVIDER_REQUIRED')
      try {
        await gateway.generateText(c.actor.id, 'provider-check', {
          prompt: 'Reply with the single word OK.',
          maxOutputTokens: 16,
        })
      } catch (error) {
        // The stored credential cannot be read (e.g. AUTH_SECRET changed): a new one is needed.
        if (error instanceof AiProviderRequired)
          return ok({ ok: false, failure: 'INVALID_CREDENTIAL' })
        return ok({ ok: false, failure: failureOf(error) })
      }
      await deps.store.setStatus(c.actor.id, 'working', null, now())
      return ok({ ok: true, failure: null })
    },

    /**
     * US3 and account deletion (FR-013): credentials are deleted from goodresearch. Google access is
     * not revoked from here (Google revokes a whole app grant, Drive included): the page links to the
     * person's Google account permissions.
     */
    removeProvider: async (c: { actor: { id: string } }): Promise<Result<void, never>> => {
      await deps.store.deleteConnection(c.actor.id)
      await deps.store.deletePendingGrant(c.actor.id)
      return ok(undefined)
    },
  }
}

export type ProviderCommands = ReturnType<typeof makeProviderCommands>
