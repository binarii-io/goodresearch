import type { ZodType } from 'zod'
import { type AiFailure, isAuthorisationFailure } from '../domain/failure.ts'
import type { Credential, ProviderKind } from '../domain/provider.ts'
import {
  type AiDeps,
  failureOf,
  type ModelRequest,
  ProviderCallError,
  type StreamPart,
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
      )
      throw error instanceof ProviderCallError ? error : new ProviderCallError('UNKNOWN')
    }
  }

  /** The person's saved credential, decrypted; only theirs, never someone else's (FR-012). */
  const resolve = async (accountId: string) => {
    const connection = await deps.store.getConnection(accountId)
    if (!connection || !deps.config.offered.includes(connection.provider))
      throw new AiProviderRequired()
    let secret: string
    try {
      secret = deps.cipher.decrypt(connection.encryptedCredential, accountId)
    } catch {
      await deps.store.setStatus(accountId, 'needs-attention', 'INVALID_CREDENTIAL', null)
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
    return { connection, credential, model: deps.config.models[connection.provider] }
  }

  /** An authorisation failure on a real call brings back the provider step (FR-009). */
  const noteFailure = async (accountId: string, error: unknown) => {
    const failure = failureOf(error)
    if (isAuthorisationFailure(failure))
      await deps.store.setStatus(accountId, 'needs-attention', failure, null)
  }

  return {
    callWith,

    /** The provider a person's calls go to now, or null without a working one (spec 009 FR-011). */
    providerOf: async (accountId: string): Promise<ProviderKind | null> => {
      const connection = await deps.store.getConnection(accountId)
      return connection && deps.config.offered.includes(connection.provider)
        ? connection.provider
        : null
    },

    /** Minimal real call proving a credential works (spec 004 FR-004, research R3 check 4). */
    check: (accountId: string, credential: Credential, model: string) =>
      callWith(accountId, 'provider-check', credential, model, () =>
        deps.runner.generateText(
          credential,
          model,
          { prompt: 'Reply with the single word OK.', maxOutputTokens: 16 },
          deps.config.timeoutMs,
        ),
      ),

    generateText: async (accountId: string, task: string, request: ModelRequest) => {
      const { credential, model } = await resolve(accountId)
      try {
        return await callWith(accountId, task, credential, model, () =>
          deps.runner.generateText(credential, model, request, deps.config.timeoutMs),
        )
      } catch (error) {
        await noteFailure(accountId, error)
        throw error
      }
    },

    /** Schema-constrained output (constitution IV); the result is validated by the schema. */
    generateObject: async <T>(
      accountId: string,
      task: string,
      request: ModelRequest & { schema: ZodType<T> },
      /** `timeoutMs`: a longer limit for calls run in the worker (spec 010 lexicon readings). */
      options: { ref?: string; timeoutMs?: number } = {},
    ) => {
      const { credential, model } = await resolve(accountId)
      const timeoutMs = options.timeoutMs ?? deps.config.timeoutMs
      try {
        return await callWith(
          accountId,
          task,
          credential,
          model,
          () => deps.runner.generateObject(credential, model, request, timeoutMs),
          options.ref ?? null,
        )
      } catch (error) {
        await noteFailure(accountId, error)
        throw error
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
      const { credential, model } = await resolve(accountId)
      const startedAt = deps.clock.now().getTime()
      const inner = deps.runner.stream(credential, model, request, deps.config.timeoutMs)
      let recorded = false
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
        )
      }
      const done = inner.done.then(
        async (usage) => {
          await recordOnce('success', usage)
          return usage
        },
        async (error: unknown) => {
          await recordOnce(failureOf(error), NO_USAGE)
          await noteFailure(accountId, error)
          throw error instanceof ProviderCallError ? error : new ProviderCallError('UNKNOWN')
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
          throw error
        } finally {
          if (!finished && !failed) await recordOnce('cancelled', NO_USAGE)
        }
      }
      return { parts: parts(), done }
    },
  }
}

export type Gateway = ReturnType<typeof makeGateway>
