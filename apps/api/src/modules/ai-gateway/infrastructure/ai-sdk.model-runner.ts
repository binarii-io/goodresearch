import { createAnthropic } from '@ai-sdk/anthropic'
import { createVertex } from '@ai-sdk/google-vertex'
import { createOpenAI } from '@ai-sdk/openai'
import {
  APICallError,
  generateText,
  type LanguageModel,
  type ModelMessage,
  NoObjectGeneratedError,
  Output,
  stepCountIs,
  streamText,
  type ToolSet,
  tool,
} from 'ai'
import { OAuth2Client } from 'google-auth-library'
import type {
  ChatMessage,
  ModelRequest,
  ModelRunner,
  StreamPart,
  ToolSpec,
  Usage,
} from '../application/ports.ts'
import { MAX_STEPS, ProviderCallError } from '../application/ports.ts'
import { classifyFailure, type ProviderErrorFacts } from '../domain/failure.ts'
import type { Credential } from '../domain/provider.ts'
import { createFakeRunner } from './fake.model-runner.ts'

/** Reads a provider error body for classification only (research R4): never logged or stored. */
const bodyFacts = (body: string | undefined): { code?: string; message?: string } => {
  try {
    const parsed = JSON.parse(body ?? '') as {
      error?: {
        code?: string | number
        type?: string
        status?: string
        message?: string
        details?: { reason?: string }[]
      }
    }
    const e = parsed.error
    const reason = e?.details?.find((d) => d.reason)?.reason
    const code = reason ?? (typeof e?.code === 'string' ? e.code : (e?.status ?? e?.type))
    return { ...(code ? { code } : {}), ...(e?.message ? { message: e.message } : {}) }
  } catch {
    return {}
  }
}

const factsOf = (error: unknown): ProviderErrorFacts => {
  if (error instanceof ProviderCallError) return { kind: 'other' }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === undefined) return { kind: 'network' }
    return { kind: 'http', status: error.statusCode, ...bodyFacts(error.responseBody) }
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return { kind: 'timeout' }
    // google-auth-library, when the person revoked the grant.
    if (/invalid_grant/.test(error.message)) return { kind: 'revoked-grant' }
  }
  return { kind: 'other' }
}

const toProviderError = (error: unknown): ProviderCallError =>
  error instanceof ProviderCallError
    ? error
    : new ProviderCallError(classifyFailure(factsOf(error)))

const usageOf = (usage: {
  inputTokens: number | undefined
  outputTokens: number | undefined
}): Usage => ({
  inputTokens: usage.inputTokens ?? null,
  outputTokens: usage.outputTokens ?? null,
})

const toModelMessage = (m: ChatMessage): ModelMessage => {
  if (m.role === 'user') return { role: 'user', content: m.content }
  if (m.role === 'tool')
    return {
      role: 'tool',
      content: m.results.map((r) => ({
        type: 'tool-result' as const,
        toolCallId: r.id,
        toolName: r.name,
        output: { type: 'text' as const, value: r.output },
      })),
    }
  if (!m.toolCalls?.length) return { role: 'assistant', content: m.content }
  return {
    role: 'assistant',
    content: [
      ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
      ...m.toolCalls.map((c) => ({
        type: 'tool-call' as const,
        toolCallId: c.id,
        toolName: c.name,
        input: c.input,
      })),
    ],
  }
}

/**
 * Tools without `execute` end the answer and are returned to the caller (spec 005 R2); tools the
 * app runs (`run`) feed their output back to the model for the next step (spec 006).
 */
const toolsOf = (request: ModelRequest): { tools?: ToolSet } =>
  request.tools?.length
    ? {
        tools: Object.fromEntries(
          request.tools.map((t) => [
            t.name,
            t.run
              ? tool({
                  description: t.description,
                  inputSchema: t.inputSchema,
                  execute: (input: unknown, { toolCallId }) => run(t, input, toolCallId),
                })
              : tool({ description: t.description, inputSchema: t.inputSchema }),
          ]),
        ),
      }
    : {}

const run = (t: ToolSpec, input: unknown, id: string): Promise<string> =>
  t.run ? t.run(input, { id }) : Promise.resolve('')

const promptOf = (request: ModelRequest) => ({
  ...(request.system ? { system: request.system } : {}),
  ...(request.messages
    ? { messages: request.messages.map(toModelMessage) }
    : { prompt: request.prompt ?? '' }),
  ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
})

/**
 * Model calls through the Vercel AI SDK (ADR-0005, research R1). Vertex AI runs with the person's
 * own Google grant (an OAuth client holding their refresh token), never with server credentials.
 */
export const createAiSdkRunner = (options: {
  google: { clientId: string; clientSecret: string } | null
  /** Tests: replaces the network. */
  fetch?: typeof fetch
  log?: { warn(object: object, message: string): void }
}): ModelRunner => {
  const fake = createFakeRunner()
  const log = options.log ?? { warn: () => undefined }
  const fetchOption = options.fetch ? { fetch: options.fetch } : {}
  // One OAuth client per Google grant, so access tokens are reused until they expire.
  const authClients = new Map<string, OAuth2Client>()
  const authClientFor = (
    google: { clientId: string; clientSecret: string },
    refreshToken: string,
  ) => {
    let client = authClients.get(refreshToken)
    if (!client) {
      if (authClients.size >= 1000) authClients.delete(authClients.keys().next().value ?? '')
      client = new OAuth2Client({ clientId: google.clientId, clientSecret: google.clientSecret })
      client.setCredentials({ refresh_token: refreshToken })
      authClients.set(refreshToken, client)
    }
    return client
  }

  const modelFor = (credential: Credential, model: string): LanguageModel => {
    switch (credential.provider) {
      case 'anthropic':
        return createAnthropic({ apiKey: credential.apiKey, ...fetchOption })(model)
      case 'openai':
        return createOpenAI({ apiKey: credential.apiKey, ...fetchOption })(model)
      case 'vertex': {
        if (!options.google) throw new ProviderCallError('INVALID_CREDENTIAL')
        const authClient = authClientFor(options.google, credential.refreshToken)
        return createVertex({
          project: credential.project,
          location: credential.region,
          googleAuthOptions: { authClient },
          ...fetchOption,
        })(model)
      }
      case 'fake':
        throw new Error('the fake provider has its own runner')
    }
  }

  return {
    generateText: async (credential, model, request, timeoutMs) => {
      if (credential.provider === 'fake')
        return fake.generateText(credential, model, request, timeoutMs)
      try {
        const result = await generateText({
          model: modelFor(credential, model),
          ...promptOf(request),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
        })
        return { text: result.text, usage: usageOf(result.usage) }
      } catch (error) {
        throw toProviderError(error)
      }
    },

    generateObject: async (credential, model, request, timeoutMs) => {
      if (credential.provider === 'fake')
        return fake.generateObject(credential, model, request, timeoutMs)
      try {
        const result = await generateText({
          model: modelFor(credential, model),
          ...promptOf(request),
          output: Output.object({ schema: request.schema }),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
        })
        // Never trust model output (AGENTS.md): validated again with the caller's schema.
        const parsed = request.schema.safeParse(result.output)
        if (parsed.success) return { object: parsed.data, usage: usageOf(result.usage) }
        log.warn(
          { kind: 'invalid-output', fields: parsed.error.issues.map((i) => i.path.join('.')) },
          'model answer does not fit the schema',
        )
        throw new ProviderCallError('UNKNOWN', usageOf(result.usage))
      } catch (error) {
        // Why it failed, never what was said (no prompt or answer in logs).
        if (NoObjectGeneratedError.isInstance(error)) {
          log.warn(
            {
              kind: 'no-object',
              finishReason: error.finishReason ?? null,
              cause: error.cause instanceof Error ? error.cause.name : null,
            },
            'model answer is not the object asked for',
          )
          throw new ProviderCallError('UNKNOWN', error.usage ? usageOf(error.usage) : null)
        }
        const failure = toProviderError(error)
        if (failure.failure === 'UNKNOWN' && !(error instanceof ProviderCallError))
          log.warn(
            {
              kind: error instanceof Error ? error.name : typeof error,
              // The status and the provider's error code say why; never the body's message (it may quote the prompt).
              ...(APICallError.isInstance(error)
                ? {
                    status: error.statusCode ?? null,
                    code: bodyFacts(error.responseBody).code ?? null,
                  }
                : {}),
            },
            'model call failed',
          )
        throw failure
      }
    },

    stream: (credential, model, request, timeoutMs) => {
      if (credential.provider === 'fake') return fake.stream(credential, model, request, timeoutMs)
      let failure: unknown
      const result = streamText({
        model: modelFor(credential, model),
        ...promptOf(request),
        ...toolsOf(request),
        stopWhen: stepCountIs(MAX_STEPS),
        maxRetries: 0,
        // A long answer may stream for minutes: the limit applies to silences, not to the total.
        timeout: { firstChunkMs: timeoutMs, chunkMs: timeoutMs },
        onError: ({ error }) => {
          failure = error
        },
      })
      // Every step of the answer counts (tool runs make several).
      const done = Promise.resolve(result.totalUsage).then(
        (usage) => {
          if (failure) throw toProviderError(failure)
          return usageOf(usage)
        },
        (error: unknown) => {
          throw toProviderError(failure ?? error)
        },
      )
      async function* parts(): AsyncGenerator<StreamPart> {
        // Steps of one answer are separate paragraphs: their texts are not glued together.
        let written = ''
        let newStep = false
        for await (const part of result.fullStream) {
          if (part.type === 'start-step') newStep = written.length > 0
          else if (part.type === 'text-delta') {
            if (newStep && part.text && !written.endsWith('\n\n')) {
              written += '\n\n'
              yield { type: 'text', delta: '\n\n' }
            }
            if (part.text) newStep = false
            written += part.text
            yield { type: 'text', delta: part.text }
          } else if (part.type === 'tool-call')
            yield {
              type: 'tool-call',
              call: { id: part.toolCallId, name: part.toolName, input: part.input },
            }
          else if (part.type === 'error') throw toProviderError(part.error)
        }
      }
      return { parts: parts(), done }
    },
  }
}
