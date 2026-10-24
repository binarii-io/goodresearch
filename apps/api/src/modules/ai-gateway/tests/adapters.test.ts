import { describe, expect, it } from 'vitest'
import { ProviderCallError } from '../application/ports.ts'
import { createAiSdkRunner } from '../infrastructure/ai-sdk.model-runner.ts'
import { createGoogleCloudApi } from '../infrastructure/google-cloud.fetch-api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const runnerAnswering = (response: () => Response) => {
  const requests: Request[] = []
  const runner = createAiSdkRunner({
    google: null,
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return response()
    },
  })
  return { runner, requests }
}

const failureOf = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error instanceof ProviderCallError ? error.failure : 'not a ProviderCallError'
  }
  return 'no error'
}

const anthropic = { provider: 'anthropic', apiKey: 'sk-ant-test-1234' } as const
const openai = { provider: 'openai', apiKey: 'sk-test-1234' } as const

describe('AI SDK runner', () => {
  it('returns the text and token usage of an Anthropic answer', async () => {
    const { runner, requests } = runnerAnswering(() =>
      json(200, {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'a-model',
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 1 },
      }),
    )
    const result = await runner.generateText(anthropic, 'a-model', { prompt: 'Reply OK' }, 5000)
    expect(result).toEqual({ text: 'OK', usage: { inputTokens: 12, outputTokens: 1 } })
    expect(requests[0]?.headers.get('x-api-key')).toBe('sk-ant-test-1234')
  })

  it('classifies a wrong key, missing credit and an outage', async () => {
    const wrong = runnerAnswering(() =>
      json(401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      }),
    )
    expect(await failureOf(wrong.runner.generateText(anthropic, 'm', { prompt: 'x' }, 5000))).toBe(
      'INVALID_CREDENTIAL',
    )
    const credit = runnerAnswering(() =>
      json(400, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Your credit balance is too low.' },
      }),
    )
    expect(await failureOf(credit.runner.generateText(anthropic, 'm', { prompt: 'x' }, 5000))).toBe(
      'NO_CREDIT_OR_QUOTA',
    )
    const quota = runnerAnswering(() =>
      json(429, {
        error: { code: 'insufficient_quota', type: 'insufficient_quota', message: 'quota' },
      }),
    )
    expect(await failureOf(quota.runner.generateText(openai, 'm', { prompt: 'x' }, 5000))).toBe(
      'NO_CREDIT_OR_QUOTA',
    )
    const down = runnerAnswering(() => json(503, { error: { message: 'unavailable' } }))
    expect(await failureOf(down.runner.generateText(openai, 'm', { prompt: 'x' }, 5000))).toBe(
      'UNREACHABLE',
    )
  })

  it('answers the dev test provider without any network call', async () => {
    const { runner, requests } = runnerAnswering(() => json(500, {}))
    const ok = await runner.generateText({ provider: 'fake', apiKey: 'test-ok-1' }, 'f', {}, 5000)
    expect(ok.text).toBe('OK')
    expect(
      await failureOf(
        runner.generateText({ provider: 'fake', apiKey: 'test-quota' }, 'f', {}, 5000),
      ),
    ).toBe('NO_CREDIT_OR_QUOTA')
    expect(requests).toHaveLength(0)
  })
})

describe('Google Cloud API (Vertex AI checklist)', () => {
  const api = (handler: (url: string, init?: RequestInit) => Response) =>
    createGoogleCloudApi({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: async (input, init) => handler(String(input), init),
    })

  it('reads the state of the Vertex AI API in the project', async () => {
    const enabled = api(() => json(200, { state: 'ENABLED' }))
    expect(await enabled.apiState('t', 'p-123456')).toBe('enabled')
    expect(await api(() => json(200, { state: 'DISABLED' })).apiState('t', 'p-123456')).toBe(
      'disabled',
    )
    expect(await api(() => json(404, {})).apiState('t', 'p-123456')).toBe('not-found')
    expect(
      await api(() => new Response('permission denied', { status: 403 })).apiState('t', 'p-123456'),
    ).toBe('no-access')
  })

  it('treats a revoked grant as an invalid credential', async () => {
    const revoked = api(() => json(400, { error: 'invalid_grant' }))
    expect(await failureOf(revoked.accessToken('refresh'))).toBe('INVALID_CREDENTIAL')
  })

  it('checks the predict permission, or says it cannot', async () => {
    expect(
      await api(() => json(200, { permissions: ['aiplatform.endpoints.predict'] })).canPredict(
        't',
        'p',
      ),
    ).toBe(true)
    expect(await api(() => json(200, {})).canPredict('t', 'p')).toBe(false)
    expect(await api(() => json(403, {})).canPredict('t', 'p')).toBeNull()
  })
})
