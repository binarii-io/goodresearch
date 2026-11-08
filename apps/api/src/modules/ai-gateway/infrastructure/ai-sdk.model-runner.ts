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
import { classifyTokenRefusal } from '#platform/google/token-refusal.ts'
import type {
  ChatMessage,
  ModelRequest,
  ModelRunner,
  RequestPart,
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

/**
 * Spec 030: google-auth-library failed to mint a token from the person's grant. Its error carries
 * Google's token answer (`response.data`), read here only to tell why.
 */
const grantRefusalOf = (error: unknown) => {
  if (!(error instanceof Error)) return null
  const response = (error as { response?: { status?: number; data?: unknown } }).response
  const data = response?.data as { error?: unknown } | undefined
  if (data?.error !== 'invalid_grant' && !/invalid_grant/.test(error.message)) return null
  return classifyTokenRefusal({
    status: response?.status ?? 400,
    body:
      data?.error === 'invalid_grant'
        ? data
        : { error: 'invalid_grant', error_description: error.message },
  })
}

const toProviderError = (error: unknown): ProviderCallError => {
  if (error instanceof ProviderCallError) return error
  const refusal = grantRefusalOf(error)
  if (refusal) return new ProviderCallError('INVALID_CREDENTIAL', null, refusal)
  return new ProviderCallError(classifyFailure(factsOf(error)))
}

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

/**
 * Spec 038: the part of a video to read travels in the file's URI fragment, which the Vertex fetch
 * turns into Gemini's `videoMetadata` (the AI SDK has no field for it on file parts).
 */
const OFFSETS = '#goodresearch-offsets='

const fileUri = (p: Extract<RequestPart, { type: 'file' }>) =>
  p.startMs === undefined && p.endMs === undefined
    ? p.uri
    : `${p.uri}${OFFSETS}${(p.startMs ?? 0) / 1000},${p.endMs === undefined ? '' : p.endMs / 1000}`

const userContent = (parts: readonly RequestPart[]) =>
  parts.map((p) =>
    p.type === 'text'
      ? { type: 'text' as const, text: p.text }
      : p.type === 'file'
        ? { type: 'file' as const, data: fileUri(p), mediaType: p.mimeType }
        : { type: 'file' as const, data: p.data, mediaType: p.mimeType },
  )

const hasMedia = (request: ModelRequest) =>
  (request.parts ?? []).some((p) => p.type === 'file' || p.type === 'image')

/**
 * Spec 038: Gemini reads files by URI; other providers cannot read a video from a bucket.
 * Images travel inline and work everywhere.
 */
const checkMedia = (credential: Credential, request: ModelRequest) => {
  if (credential.provider !== 'vertex' && (request.parts ?? []).some((p) => p.type === 'file'))
    throw new ProviderCallError('MEDIA_NOT_SUPPORTED')
}

/** Spec 038: frames and videos read at high resolution (small text on screens). */
const mediaOptions = (credential: Credential, request: ModelRequest) =>
  credential.provider === 'vertex' && hasMedia(request)
    ? {
        providerOptions: {
          vertex: { mediaResolution: 'MEDIA_RESOLUTION_HIGH' as const },
          google: { mediaResolution: 'MEDIA_RESOLUTION_HIGH' as const },
        },
      }
    : {}

const promptOf = (request: ModelRequest) => ({
  ...(request.system ? { system: request.system } : {}),
  ...(request.messages
    ? { messages: request.messages.map(toModelMessage) }
    : request.parts
      ? { messages: [{ role: 'user' as const, content: userContent(request.parts) }] }
      : { prompt: request.prompt ?? '' }),
  ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
})

type Fetch = typeof fetch

/**
 * Spec 038: moves the offsets of a file part's URI into Gemini's `videoMetadata`, so a task is
 * read on its own part of the video. Other requests go through unchanged.
 */
export const withVideoOffsets =
  (base: Fetch): Fetch =>
  async (input, init) => {
    const body = init?.body
    if (typeof body !== 'string' || !body.includes(OFFSETS)) return base(input, init)
    const json = JSON.parse(body) as {
      contents?: { parts?: { fileData?: { fileUri?: string }; videoMetadata?: unknown }[] }[]
    }
    for (const content of json.contents ?? [])
      for (const part of content.parts ?? []) {
        const uri = part.fileData?.fileUri
        const at = uri?.indexOf(OFFSETS) ?? -1
        if (!uri || !part.fileData || at < 0) continue
        const [start, end] = uri.slice(at + OFFSETS.length).split(',')
        part.fileData.fileUri = uri.slice(0, at)
        part.videoMetadata = {
          ...(start ? { startOffset: `${start}s` } : {}),
          ...(end ? { endOffset: `${end}s` } : {}),
        }
      }
    return base(input, { ...init, body: JSON.stringify(json) })
  }

/**
 * Model calls through the Vercel AI SDK (ADR-0005, research R1). Vertex AI runs with the person's
 * own Google grant (an OAuth client holding their refresh token), or, for the instance's shared
 * provider the deployer configured (spec 035), with its service account or its own identity.
 */
const CLOUD_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform'

export const createAiSdkRunner = (options: {
  google: { clientId: string; clientSecret: string } | null
  /** Tests: replaces the network. */
  fetch?: typeof fetch
  log?: { warn(object: object, message: string): void }
}): ModelRunner => {
  const fake = createFakeRunner()
  const log = options.log ?? { warn: () => undefined }
  const fetchOption = options.fetch ? { fetch: options.fetch } : {}
  // Vertex AI only: the offsets of video parts (spec 038).
  const vertexFetch = { fetch: withVideoOffsets(options.fetch ?? globalThis.fetch) }
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

  // One provider for the shared Vertex AI, so its access tokens are reused until they expire.
  let sharedVertex: { key: string; provider: ReturnType<typeof createVertex> } | null = null
  const sharedVertexFor = (
    credential: Extract<Credential, { serviceAccount: unknown }>,
  ): ReturnType<typeof createVertex> => {
    const key = [
      credential.project,
      credential.region,
      credential.serviceAccount === 'instance'
        ? 'instance'
        : credential.serviceAccount.client_email,
    ].join('|')
    if (sharedVertex?.key !== key)
      sharedVertex = {
        key,
        provider: createVertex({
          project: credential.project,
          location: credential.region,
          googleAuthOptions:
            credential.serviceAccount === 'instance'
              ? { scopes: [CLOUD_PLATFORM] }
              : { credentials: credential.serviceAccount, scopes: [CLOUD_PLATFORM] },
          ...vertexFetch,
        }),
      }
    return sharedVertex.provider
  }

  const modelFor = (credential: Credential, model: string): LanguageModel => {
    switch (credential.provider) {
      case 'anthropic':
        return createAnthropic({ apiKey: credential.apiKey, ...fetchOption })(model)
      case 'openai':
        return createOpenAI({ apiKey: credential.apiKey, ...fetchOption })(model)
      case 'vertex': {
        // Spec 035: the instance's shared Vertex AI, with its service account or its own identity.
        if ('serviceAccount' in credential) return sharedVertexFor(credential)(model)
        if (!options.google) throw new ProviderCallError('INVALID_CREDENTIAL')
        const authClient = authClientFor(options.google, credential.refreshToken)
        return createVertex({
          project: credential.project,
          location: credential.region,
          googleAuthOptions: { authClient },
          ...vertexFetch,
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
        checkMedia(credential, request)
        const result = await generateText({
          model: modelFor(credential, model),
          ...promptOf(request),
          ...mediaOptions(credential, request),
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
        checkMedia(credential, request)
        const result = await generateText({
          model: modelFor(credential, model),
          ...promptOf(request),
          ...mediaOptions(credential, request),
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
        // The last step must write: an answer that ends on a tool call says nothing to the person.
        prepareStep: ({ stepNumber }) =>
          stepNumber === MAX_STEPS - 1 ? { toolChoice: 'none' as const } : {},
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
