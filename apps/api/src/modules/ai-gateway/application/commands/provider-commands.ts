import { createHash, randomBytes } from 'node:crypto'
import { err, ok, type Result, safeReturnPath } from '@goodresearch/shared'
import type { AiFailure } from '../../domain/failure.ts'
import type { GrantProblem } from '../../domain/grant-problem.ts'
import {
  type ApiKeyProvider,
  type Credential,
  credentialHint,
  isValidProjectId,
  VERTEX_REGIONS,
} from '../../domain/provider.ts'
import { AiProviderRequired, type Gateway } from '../gateway.ts'
import {
  type AiDeps,
  failureOf,
  GrantScopeMissing,
  type OauthState,
  ProviderCallError,
  type StoredConnection,
} from '../ports.ts'
import { makeUsageCosts } from '../queries/usage-costs.ts'

const STATE_TTL_MS = 10 * 60 * 1000
const PENDING_GRANT_TTL_MS = 60 * 60 * 1000

export type ProviderError =
  | 'AI_PROVIDER_NOT_OFFERED'
  | 'AI_CHECK_FAILED'
  | 'AI_PROVIDER_REQUIRED'
  | 'GOOGLE_NOT_CONFIGURED'
  | 'GOOGLE_GRANT_REQUIRED'
  | 'VALIDATION'

/** Spec 030 US4: what the session check found (no AI call). */
export type GrantCheckResult =
  | { state: 'none' | 'ok' | 'unreachable' }
  | { state: 'problem'; grantProblem: GrantProblem }

export type VertexCheck = {
  key: 'format' | 'api' | 'permission' | 'call'
  status: 'ok' | 'error' | 'skipped' | 'unknown'
  failure: AiFailure | null
}

/** Provider connection commands (spec 004 US1–US3). */
export const makeProviderCommands = (deps: AiDeps, gateway: Gateway) => {
  const now = () => deps.clock.now()
  const usageCosts = makeUsageCosts(deps)

  const save = async (connection: StoredConnection) => {
    await deps.store.saveConnection(connection)
    return connection
  }

  /**
   * Research R3: format, project access and API, permission (not blocking), real call; saves the
   * Vertex AI connection only when they pass (spec 004 checklist, reused by spec 030 reconnect).
   */
  const verifyAndSave = async (
    accountId: string,
    refreshToken: string,
    googleAccount: string | null,
    rawProject: string,
    region: string,
    /** Spec 030: the reconnection the real call is made for, to show its cost. */
    ref: string | null = null,
  ): Promise<{ checks: VertexCheck[]; connection: StoredConnection | null }> => {
    const google = deps.google
    if (!google) return { checks: [], connection: null }
    const project = rawProject.trim()
    const checks: VertexCheck[] = []
    const finish = (connection: StoredConnection | null) => {
      const order: VertexCheck['key'][] = ['format', 'api', 'permission', 'call']
      for (const key of order)
        if (!checks.some((check) => check.key === key))
          checks.push({ key, status: 'skipped', failure: null })
      return { checks, connection }
    }

    if (!isValidProjectId(project)) {
      checks.push({ key: 'format', status: 'error', failure: null })
      return finish(null)
    }
    checks.push({ key: 'format', status: 'ok', failure: null })

    let accessToken: string
    try {
      accessToken = await google.cloud.accessToken(refreshToken)
    } catch (error) {
      checks.push({ key: 'api', status: 'error', failure: failureOf(error) })
      return finish(null)
    }
    const state = await google.cloud.apiState(accessToken, project).catch(() => null)
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

    const allowed = await google.cloud.canPredict(accessToken, project).catch(() => null)
    // Not blocking: the real call decides (prototype rule).
    checks.push({
      key: 'permission',
      status: allowed === null ? 'unknown' : allowed ? 'ok' : 'error',
      failure: allowed === false ? 'PERMISSION_DENIED' : null,
    })

    const credential: Credential = { provider: 'vertex', refreshToken, project, region }
    const model = deps.config.models.vertex
    try {
      await gateway.check(accountId, credential, model, ref)
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
      googleAccount,
      project,
      region,
      status: 'working',
      lastFailure: null,
      grantProblem: null,
      lastCheckedAt: now(),
    })
    await deps.store.deletePendingGrant(accountId)
    return finish(connection)
  }

  /** Spec 030 US4: a token from the saved Vertex AI grant, nothing else. */
  const checkGrantOf = async (accountId: string): Promise<GrantCheckResult> => {
    const current = await deps.store.getConnection(accountId)
    if (!deps.google || current?.provider !== 'vertex' || !deps.config.offered.includes('vertex'))
      return { state: 'none' }
    let refreshToken: string
    try {
      refreshToken = deps.cipher.decrypt(current.encryptedCredential, accountId)
    } catch {
      await deps.store.setStatus(
        accountId,
        'needs-attention',
        'INVALID_CREDENTIAL',
        null,
        'unreadable',
      )
      return { state: 'problem', grantProblem: 'unreadable' }
    }
    try {
      await deps.google.cloud.accessToken(refreshToken)
    } catch (error) {
      if (error instanceof ProviderCallError && error.failure === 'INVALID_CREDENTIAL') {
        const grantProblem = error.grantProblem ?? 'refused'
        await deps.store.setStatus(
          accountId,
          'needs-attention',
          'INVALID_CREDENTIAL',
          null,
          grantProblem,
        )
        return { state: 'problem', grantProblem }
      }
      return { state: 'unreachable' }
    }
    // The grant came back (e.g. the organisation's sign-in was done elsewhere).
    if (current.grantProblem) await deps.store.setStatus(accountId, 'working', null, now())
    return { state: 'ok' }
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
          grantProblem: null,
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
          mode: 'setup',
          popup: false,
          expiresAt: new Date(now().getTime() + STATE_TTL_MS),
        },
        now(),
      )
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      return ok({
        url: deps.google.oauth.authorizationUrl({ state, codeChallenge }),
      })
    },

    /**
     * Spec 030 US1: Google on the saved account, for the same rights; the callback checks the saved
     * project and region again instead of showing the form.
     */
    startGoogleReconnect: async (c: {
      actor: { id: string }
      returnTo: string
      popup: boolean
    }): Promise<Result<{ url: string }, ProviderError>> => {
      if (!deps.google) return err('GOOGLE_NOT_CONFIGURED')
      if (!deps.config.offered.includes('vertex')) return err('AI_PROVIDER_NOT_OFFERED')
      const current = await deps.store.getConnection(c.actor.id)
      if (current?.provider !== 'vertex') return err('AI_PROVIDER_REQUIRED')
      const state = randomBytes(24).toString('base64url')
      const codeVerifier = randomBytes(48).toString('base64url')
      await deps.store.saveOauthState(
        {
          state,
          accountId: c.actor.id,
          codeVerifier,
          returnTo: safeReturnPath(c.returnTo),
          mode: 'reconnect',
          popup: c.popup,
          expiresAt: new Date(now().getTime() + STATE_TTL_MS),
        },
        now(),
      )
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
      return ok({
        url: deps.google.oauth.authorizationUrl({
          state,
          codeChallenge,
          ...(current.googleAccount ? { loginHint: current.googleAccount } : {}),
        }),
      })
    },

    /** Google came back without a consent (cancelled, error): where the person goes back. */
    abandonGoogleGrant: async (c: {
      actor: { id: string }
      state: string
    }): Promise<
      Result<{ returnTo: string; mode: OauthState['mode']; popup: boolean }, ProviderError>
    > => {
      const saved = await deps.store.takeOauthState(c.state, now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      return ok({ returnTo: saved.returnTo, mode: saved.mode, popup: saved.popup })
    },

    /**
     * The state is single-use, expires after 10 minutes and must belong to the signed-in person.
     * Setup: the grant waits for the checklist. Reconnect (spec 030): same account, saved project and
     * region checked again, saved only when the checks pass; otherwise the grant waits for the form.
     */
    completeGoogleGrant: async (c: {
      actor: { id: string }
      state: string
      code: string
    }): Promise<
      Result<
        {
          returnTo: string
          mode: OauthState['mode']
          popup: boolean
          result?: 'reconnected' | 'checks-failed' | 'other-account' | 'missing-right' | 'error'
          /** USD cost of the reconnection's real call; null when unknown or not made. */
          cost?: number | null
        },
        ProviderError
      >
    > => {
      if (!deps.google) return err('GOOGLE_NOT_CONFIGURED')
      const saved = await deps.store.takeOauthState(c.state, now())
      if (!saved || saved.accountId !== c.actor.id) return err('VALIDATION')
      const back = { returnTo: saved.returnTo, mode: saved.mode, popup: saved.popup }
      let granted: { accessToken: string; refreshToken: string }
      try {
        granted = await deps.google.oauth.exchange({
          code: c.code,
          codeVerifier: saved.codeVerifier,
        })
      } catch (error) {
        if (saved.mode === 'setup') throw error
        if (error instanceof GrantScopeMissing) return ok({ ...back, result: 'missing-right' })
        // The pop-up must still end on its landing page, so the page that opened it hears back.
        deps.log.warn({ err: error }, 'Google reconnection exchange failed')
        return ok({ ...back, result: 'error' })
      }
      const googleAccount = await deps.google.cloud
        .accountEmail(granted.accessToken)
        .catch(() => null)
      const keepPending = () =>
        deps.store.savePendingGrant({
          accountId: c.actor.id,
          encryptedRefreshToken: deps.cipher.encrypt(granted.refreshToken, c.actor.id),
          googleAccount,
          expiresAt: new Date(now().getTime() + PENDING_GRANT_TTL_MS),
        })
      if (saved.mode === 'setup') {
        await keepPending()
        return ok(back)
      }
      const current = await deps.store.getConnection(c.actor.id)
      if (current?.provider !== 'vertex' || !current.project) {
        await keepPending()
        return ok({ ...back, result: 'checks-failed' })
      }
      // Without the account's address, it cannot be told apart from the saved one: try again. A
      // connection saved without its address has nothing to compare with.
      if (!googleAccount && current.googleAccount !== null) return ok({ ...back, result: 'error' })
      // Another account would silently change whose project is billed: full setup only. A
      // connection saved without its address (it could not be read then) takes this one.
      if (
        googleAccount &&
        current.googleAccount !== null &&
        googleAccount !== current.googleAccount
      ) {
        await keepPending()
        return ok({ ...back, result: 'other-account' })
      }
      const ref = `google-reconnect:${c.state.slice(0, 16)}`
      const verified = await verifyAndSave(
        c.actor.id,
        granted.refreshToken,
        googleAccount,
        current.project,
        current.region ?? 'global',
        ref,
      )
      const cost = (await usageCosts(c.actor.id, [ref])).get(ref) ?? null
      if (verified.connection) return ok({ ...back, result: 'reconnected', cost })
      await keepPending()
      return ok({ ...back, result: 'checks-failed', cost })
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

      return ok(
        await verifyAndSave(accountId, refreshToken, source.googleAccount, c.project, c.region),
      )
    },

    /**
     * Spec 030 US4: once per browser session, a token is asked from the saved grant (no AI call, no
     * cost). A refusal records the reason; an unreachable Google changes nothing.
     */
    checkGrant: async (c: { actor: { id: string } }): Promise<Result<GrantCheckResult, never>> =>
      ok(await checkGrantOf(c.actor.id)),

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
