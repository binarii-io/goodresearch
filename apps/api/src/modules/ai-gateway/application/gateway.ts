import type { ZodType } from 'zod'
import { type AiFailure, isAuthorisationFailure, isDeployerFailure } from '../domain/failure.ts'
import type { Credential, ProviderKind } from '../domain/provider.ts'
import {
  type AiDeps,
  failureOf,
  type ModelRequest,
  type ModelTier,
  ProviderCallError,
  type StreamPart,
  servingOf,
  type Usage,
} from './ports.ts'

/** No working provider for this person: the AI feature asks them to set one up (FR-002). */
export class AiProviderRequired extends Error {
  override name = 'AiProviderRequired'
}

const NO_USAGE: Usage = { inputTokens: null, outputTokens: null }

/**
 * The AI Gateway (constitution IV, spec 004 US4): every model call uses the calling person's own
 * provider (FR-012) and records exactly one usage entry, without prompt or answer (FR-010).
 */
export const makeGateway = (deps: AiDeps) => {
  const record = async (
    accountId: string,
    task: string,
    provider: ProviderKind,
    model: string,
    startedAt: number,
    outcome: 'success' | 'cancelled' | AiFailure,
    usage: Usage,
    ref: string | null = null,
    shared = false,
  ) => {
    await deps.store.appendUsage({
      id: deps.newId(),
      accountId,
      task,
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: Math.max(0, deps.clock.now().getTime() - startedAt),
      outcome,
      ref,
      shared,
      createdAt: deps.clock.now(),
    })
  }

  /** Runs `call` with an explicit credential (checks before saving) and records it. */
  const callWith = async <T extends { usage: Usage }>(
    accountId: string,
    task: string,
    credential: Credential,
    model: string,
    call: () => Promise<T>,
    ref: string | null = null,
    /** Spec 035: served by the instance's shared provider. */
    shared = false,
  ): Promise<T> => {
    const startedAt = deps.clock.now().getTime()
    try {
      const result = await call()
      await record(
        accountId,
        task,
        credential.provider,
        model,
        startedAt,
        'success',
        result.usage,
        ref,
        shared,
      )
      return result
    } catch (error) {
      await record(
        accountId,
        task,
        credential.provider,
        model,
        startedAt,
        failureOf(error),
        // A failed call can still be billed (spec 009: every AI cost is shown).
        error instanceof ProviderCallError && error.usage ? error.usage : NO_USAGE,
        ref,
        shared,
      )
      throw error instanceof ProviderCallError ? error : new ProviderCallError('UNKNOWN')
    }
  }

  /**
   * The credential a person's calls use: their own, decrypted, never someone else's (FR-012), even
   * when it needs attention; else the instance's shared provider when it is open to them (spec 035).
   */
  const resolve = async (
    accountId: string,
  ): Promise<{ credential: Credential; model: string; shared: boolean }> => {
    const serving = await servingOf(deps, accountId)
    if (!serving) throw new AiProviderRequired()
    if (serving.kind === 'shared')
      return { credential: serving.credential, model: serving.model, shared: true }
    const connection = serving.connection
    let secret: string
    try {
      secret = deps.cipher.decrypt(connection.encryptedCredential, accountId)
    } catch {
      // Spec 030: a Vertex AI grant is reconnected with its saved project and region.
      await deps.store.setStatus(
        accountId,
        'needs-attention',
        'INVALID_CREDENTIAL',
        null,
        connection.provider === 'vertex' ? 'unreadable' : null,
      )
      throw new AiProviderRequired()
    }
    const credential: Credential =
      connection.provider === 'vertex'
        ? {
            provider: 'vertex',
            refreshToken: secret,
            project: connection.project ?? '',
            region: connection.region ?? 'global',
          }
        : { provider: connection.provider, apiKey: secret }
    return { credential, model: deps.config.models[connection.provider], shared: false }
  }

  /**
   * Spec 035: a failure of the shared provider is the deployer's to fix: logged (never its
   * credential), never stored on the person; the caller hears that the instance's AI is unavailable.
   */
  const sharedFailure = (accountId: string, task: string, error: unknown) => {
    const failure = failureOf(error)
    // Refused (the deployer's to fix), or a call that failed otherwise (an answer cut, a network
    // error): said as such, so the logs do not blame the provider's access for every failure.
    deps.log.warn(
      { failure, provider: deps.config.shared?.credential.provider, task, accountId },
      isDeployerFailure(failure)
        ? 'the shared AI provider refused a call'
        : 'a call to the shared AI provider failed',
    )
    return isDeployerFailure(failure)
      ? new ProviderCallError(
          'SHARED_PROVIDER_UNAVAILABLE',
          error instanceof ProviderCallError ? error.usage : null,
        )
      : error
  }

  /** What a failed call becomes for the caller: the person's step back, or the deployer's log. */
  const onFailure = async (
    accountId: string,
    task: string,
    error: unknown,
    resolved: { credential: Credential; shared: boolean },
  ) => {
    if (resolved.shared) return sharedFailure(accountId, task, error)
    await noteFailure(accountId, error, resolved.credential.provider)
    return error
  }

  /** An authorisation failure on a real call brings back the provider step (FR-009). */
  const noteFailure = async (accountId: string, error: unknown, provider: ProviderKind) => {
    const failure = failureOf(error)
    if (!isAuthorisationFailure(failure)) return
    // Spec 030: a refused Vertex AI access is always Google refusing the person's grant.
    const grantProblem =
      provider === 'vertex' && failure === 'INVALID_CREDENTIAL'
        ? ((error instanceof ProviderCallError ? error.grantProblem : null) ?? 'refused')
        : null
    await deps.store.setStatus(accountId, 'needs-attention', failure, null, grantProblem)
  }

  return {
    callWith,

    /**
     * The provider a person's calls go to now, or null without a working one (spec 009 FR-011):
     * their own, else the shared one open to them (spec 035; consents stay per provider kind).
     */
    providerOf: async (accountId: string): Promise<ProviderKind | null> =>
      (await servingOf(deps, accountId))?.provider ?? null,

    /**
     * Spec 038: the Google project, region and a short-lived access token of the Vertex AI serving
     * the person, for the staging bucket of the video analysis; null when it is not Vertex AI.
     */
    googleAccessFor: async (
      accountId: string,
    ): Promise<{ project: string; region: string; accessToken: string } | null> => {
      const serving = await servingOf(deps, accountId)
      if (serving?.provider !== 'vertex') return null
      const resolved = await resolve(accountId)
      const { credential } = resolved
      if (credential.provider !== 'vertex') return null
      const { project, region } = credential
      try {
        if ('serviceAccount' in credential) {
          if (!deps.serviceAccessToken) return null
          return { project, region, accessToken: await deps.serviceAccessToken(credential) }
        }
        if (!deps.google) return null
        return {
          project,
          region,
          accessToken: await deps.google.cloud.accessToken(credential.refreshToken),
        }
      } catch (error) {
        // As for a call: a refused grant brings the provider step back (needs attention).
        throw await onFailure(accountId, 'video-staging', error, resolved)
      }
    },

    /** Minimal real call proving a credential works (spec 004 FR-004, research R3 check 4). */
    /** `ref`: what the check was for, to show its cost (spec 030: a reconnection). */
    check: (accountId: string, credential: Credential, model: string, ref: string | null = null) =>
      callWith(
        accountId,
        'provider-check',
        credential,
        model,
        () =>
          deps.runner.generateText(
            credential,
            model,
            { prompt: 'Reply with the single word OK.', maxOutputTokens: 16 },
            deps.config.timeoutMs,
          ),
        ref,
      ),

    generateText: async (accountId: string, task: string, request: ModelRequest) => {
      const resolved = await resolve(accountId)
      const { credential, model } = resolved
      try {
        return await callWith(
          accountId,
          task,
          credential,
          model,
          () => deps.runner.generateText(credential, model, request, deps.config.timeoutMs),
          null,
          resolved.shared,
        )
      } catch (error) {
        throw await onFailure(accountId, task, error, resolved)
      }
    },

    /** Schema-constrained output (constitution IV); the result is validated by the schema. */
    generateObject: async <T>(
      accountId: string,
      task: string,
      request: ModelRequest & { schema: ZodType<T> },
      /**
       * `timeoutMs`: a longer limit for calls run in the worker (spec 010 lexicon readings).
       * `tier`: the provider's strong model for heavier steps (spec 038); the ledger records it.
       */
      options: { ref?: string; timeoutMs?: number; tier?: ModelTier } = {},
    ) => {
      const resolved = await resolve(accountId)
      const { credential } = resolved
      const model =
        options.tier === 'strong' ? deps.config.strongModels[credential.provider] : resolved.model
      const timeoutMs = options.timeoutMs ?? deps.config.timeoutMs
      try {
        return await callWith(
          accountId,
          task,
          credential,
          model,
          () => deps.runner.generateObject(credential, model, request, timeoutMs),
          options.ref ?? null,
          resolved.shared,
        )
      } catch (error) {
        throw await onFailure(accountId, task, error, resolved)
      }
    },

    /**
     * Streamed answer for conversations (text and tool calls). Exactly one entry is recorded: when the stream ends, fails,
     * or when the caller stops reading it (`cancelled`, e.g. the browser went away).
     */
    stream: async (
      accountId: string,
      task: string,
      request: ModelRequest,
      options: { ref?: string } = {},
    ) => {
      const resolved = await resolve(accountId)
      const { credential, model } = resolved
      const startedAt = deps.clock.now().getTime()
      const inner = deps.runner.stream(credential, model, request, deps.config.timeoutMs)
      let recorded = false
      // What the caller hears of a failure, the same whether read from `parts` or `done`, made once
      // (spec 035: a shared provider's failure is the instance's, logged once).
      let reported: Promise<ProviderCallError> | null = null
      const report = (error: unknown) => {
        reported ??= onFailure(accountId, task, error, resolved).then((e) =>
          e instanceof ProviderCallError ? e : new ProviderCallError('UNKNOWN'),
        )
        return reported
      }
      const recordOnce = async (outcome: 'success' | 'cancelled' | AiFailure, usage: Usage) => {
        if (recorded) return
        recorded = true
        await record(
          accountId,
          task,
          credential.provider,
          model,
          startedAt,
          outcome,
          usage,
          options.ref ?? null,
          resolved.shared,
        )
      }
      const done = inner.done.then(
        async (usage) => {
          await recordOnce('success', usage)
          return usage
        },
        async (error: unknown) => {
          await recordOnce(failureOf(error), NO_USAGE)
          throw await report(error)
        },
      )
      // Callers that only read the text must not leave a rejection unhandled.
      done.catch(() => {})
      async function* parts(): AsyncGenerator<StreamPart> {
        let finished = false
        let failed = false
        try {
          for await (const part of inner.parts) yield part
          finished = true
        } catch (error) {
          failed = true
          throw await report(error)
        } finally {
          if (!finished && !failed) await recordOnce('cancelled', NO_USAGE)
        }
      }
      return { parts: parts(), done }
    },
  }
}

export type Gateway = ReturnType<typeof makeGateway>
