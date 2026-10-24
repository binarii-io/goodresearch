import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AiProviderRequired } from '../application/gateway.ts'
import { aiWorld } from './fakes/in-memory-ai.ts'

const ada = { id: 'ada' }
const bob = { id: 'bob' }
let world: ReturnType<typeof aiWorld>

beforeEach(() => {
  world = aiWorld()
})

describe('US1 — connect with an API key', () => {
  it('saves a key only after a real check, masked, and records the check', async () => {
    const result = await world.commands.connectApiKey({
      actor: ada,
      provider: 'anthropic',
      apiKey: '  sk-test-key-1234 \n',
    })
    expect(result.ok).toBe(true)
    const saved = world.connections.get('ada')
    expect(saved).toMatchObject({ provider: 'anthropic', model: 'a-model', credentialHint: '1234' })
    expect(saved?.encryptedCredential).not.toContain('sk-test')
    expect(world.deps.cipher.decrypt(saved?.encryptedCredential ?? '', 'ada')).toBe(
      'sk-test-key-1234',
    )
    expect(world.usage).toEqual([
      expect.objectContaining({ accountId: 'ada', task: 'provider-check', outcome: 'success' }),
    ])
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'working' })
  })

  it('keeps the step open with the reason when the check fails, and saves nothing', async () => {
    const result = await world.commands.connectApiKey({
      actor: ada,
      provider: 'openai',
      apiKey: 'bad-key-0000',
    })
    expect(result).toEqual({
      ok: false,
      error: 'AI_CHECK_FAILED',
      detail: { failure: 'INVALID_CREDENTIAL' },
    })
    expect(world.connections.has('ada')).toBe(false)
    expect(world.usage[0]?.outcome).toBe('INVALID_CREDENTIAL')
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'none' })
  })

  it('refuses a provider the deployer does not offer', async () => {
    const limited = aiWorld({ offered: ['openai'] })
    const result = await limited.commands.connectApiKey({
      actor: ada,
      provider: 'anthropic',
      apiKey: 'sk-test-key-1234',
    })
    expect(result).toMatchObject({ ok: false, error: 'AI_PROVIDER_NOT_OFFERED' })
  })

  it('does not require anything when no provider is offered', async () => {
    expect(await aiWorld({ offered: [] }).queries.gate('ada')).toEqual({
      required: false,
      status: 'none',
    })
  })
})

describe('US2 — Vertex AI with the person’s Google account', () => {
  const consent = async () => {
    const start = await world.commands.startGoogleGrant({
      actor: ada,
      returnTo: '/setup/ai-provider',
    })
    if (!start.ok) throw new Error('start failed')
    const state = new URL(start.value.url).searchParams.get('state') ?? ''
    return world.commands.completeGoogleGrant({ actor: ada, state, code: 'c1' })
  }

  it('keeps the consent pending until the checklist passes, then saves the connection', async () => {
    expect(await consent()).toEqual({ ok: true, value: { returnTo: '/setup/ai-provider' } })
    expect(world.grants.get('ada')?.googleAccount).toBe('ada@example.org')
    expect(world.connections.has('ada')).toBe(false)

    const result = await world.commands.checkVertex({
      actor: ada,
      project: 'my-research-1',
      region: 'europe-west1',
    })
    expect(result.ok && result.value.checks).toEqual([
      { key: 'format', status: 'ok', failure: null },
      { key: 'api', status: 'ok', failure: null },
      { key: 'permission', status: 'ok', failure: null },
      { key: 'call', status: 'ok', failure: null },
    ])
    expect(world.connections.get('ada')).toMatchObject({
      provider: 'vertex',
      project: 'my-research-1',
      region: 'europe-west1',
      googleAccount: 'ada@example.org',
      credentialHint: null,
    })
    expect(world.grants.has('ada')).toBe(false)
  })

  it('stops at the first blocking check and can be run again without a new consent', async () => {
    await consent()
    const badFormat = await world.commands.checkVertex({
      actor: ada,
      project: 'X',
      region: 'global',
    })
    expect(badFormat.ok && badFormat.value.checks.map((c) => c.status)).toEqual([
      'error',
      'skipped',
      'skipped',
      'skipped',
    ])
    world.google.cloud.state = 'disabled'
    const disabled = await world.commands.checkVertex({
      actor: ada,
      project: 'my-research-1',
      region: 'global',
    })
    expect(disabled.ok && disabled.value.checks[1]).toEqual({
      key: 'api',
      status: 'error',
      failure: 'API_DISABLED',
    })
    world.google.cloud.state = 'enabled'
    world.google.cloud.predict = null
    const passed = await world.commands.checkVertex({
      actor: ada,
      project: 'my-research-1',
      region: 'global',
    })
    // The permission cannot be verified: not blocking, the real call decides.
    expect(passed.ok && passed.value.checks[2]?.status).toBe('unknown')
    expect(passed.ok && passed.value.connection).not.toBeNull()
  })

  it('does not block on a project whose services the person cannot read: the real call decides', async () => {
    await consent()
    world.google.cloud.state = 'no-access'
    const result = await world.commands.checkVertex({
      actor: ada,
      project: 'my-research-1',
      region: 'global',
    })
    expect(result.ok && result.value.checks.map((c) => c.status)).toEqual([
      'ok',
      'unknown',
      'ok',
      'ok',
    ])
    expect(world.connections.get('ada')?.provider).toBe('vertex')
  })

  it('reports a failed real call (billing, model in region) and saves nothing', async () => {
    await consent()
    world.model.failNext('MODEL_UNAVAILABLE')
    const result = await world.commands.checkVertex({
      actor: ada,
      project: 'my-research-1',
      region: 'asia-northeast1',
    })
    expect(result.ok && result.value.checks[3]).toEqual({
      key: 'call',
      status: 'error',
      failure: 'MODEL_UNAVAILABLE',
    })
    expect(world.connections.has('ada')).toBe(false)
  })

  it('needs a consent first, and a state that belongs to the person', async () => {
    expect(
      await world.commands.checkVertex({ actor: ada, project: 'my-research-1', region: 'global' }),
    ).toMatchObject({ ok: false, error: 'GOOGLE_GRANT_REQUIRED' })
    const start = await world.commands.startGoogleGrant({ actor: ada, returnTo: '/' })
    const state = start.ok ? (new URL(start.value.url).searchParams.get('state') ?? '') : ''
    expect(
      await world.commands.completeGoogleGrant({ actor: bob, state, code: 'c' }),
    ).toMatchObject({
      ok: false,
      error: 'VALIDATION',
    })
  })
})

describe('US3 — test, switch, remove', () => {
  it('flags the connection when a test fails for an authorisation reason, and clears it on success', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-good-1234' })
    world.model.failNext('INVALID_CREDENTIAL')
    expect(await world.commands.testProvider({ actor: ada })).toEqual({
      ok: true,
      value: { ok: false, failure: 'INVALID_CREDENTIAL' },
    })
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'needs-attention' })
    expect(await world.commands.testProvider({ actor: ada })).toEqual({
      ok: true,
      value: { ok: true, failure: null },
    })
    expect(world.connections.get('ada')?.status).toBe('working')
  })

  it('asks for a new key when the stored one cannot be read any more', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-good-1234' })
    const saved = world.connections.get('ada')
    if (saved) world.connections.set('ada', { ...saved, encryptedCredential: 'v2:broken' })
    expect(await world.commands.testProvider({ actor: ada })).toEqual({
      ok: true,
      value: { ok: false, failure: 'INVALID_CREDENTIAL' },
    })
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'needs-attention' })
  })

  it('does not flag the connection for a passing outage', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-good-1234' })
    world.model.failNext('UNREACHABLE')
    await world.commands.testProvider({ actor: ada })
    expect(world.connections.get('ada')?.status).toBe('working')
  })

  it('replaces Vertex AI by another provider and removes it, without revoking at Google', async () => {
    const start = await world.commands.startGoogleGrant({ actor: ada, returnTo: '/' })
    const state = start.ok ? (new URL(start.value.url).searchParams.get('state') ?? '') : ''
    await world.commands.completeGoogleGrant({ actor: ada, state, code: 'g1' })
    await world.commands.checkVertex({ actor: ada, project: 'my-research-1', region: 'global' })
    await world.commands.connectApiKey({
      actor: ada,
      provider: 'anthropic',
      apiKey: 'sk-good-1234',
    })
    // Google revokes a whole app grant (Drive included): the person removes it in their Google account.
    expect(world.connections.get('ada')?.provider).toBe('anthropic')
    await world.commands.removeProvider({ actor: ada })
    expect(world.connections.has('ada')).toBe(false)
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'none' })
  })
})

describe('US4 — gateway and ledger', () => {
  it('uses only the caller’s own provider (FR-012)', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'anthropic', apiKey: 'sk-ada-1234' })
    await expect(
      world.gateway.generateText('bob', 'guide-assistant', { prompt: 'hi' }),
    ).rejects.toThrow(AiProviderRequired)
    await world.gateway.generateText('ada', 'guide-assistant', { prompt: 'hi' })
    const last = world.model.calls.at(-1)?.credential
    expect(last).toEqual({ provider: 'anthropic', apiKey: 'sk-ada-1234' })
  })

  it('records one entry per call with tokens and outcome, never the prompt', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    world.usage.length = 0
    await world.gateway.generateObject('ada', 'guide-assistant', {
      prompt: 'secret interview plan',
      schema: z.object({ answer: z.string() }),
    })
    world.model.failNext('RATE_LIMITED')
    await expect(
      world.gateway.generateText('ada', 'guide-assistant', { prompt: 'x' }),
    ).rejects.toThrow()
    expect(world.usage.map((e) => [e.task, e.outcome, e.inputTokens, e.outputTokens])).toEqual([
      ['guide-assistant', 'success', 10, 2],
      ['guide-assistant', 'RATE_LIMITED', null, null],
    ])
    expect(JSON.stringify(world.usage)).not.toContain('secret interview plan')
  })

  it('records a streamed answer when the stream ends', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    world.usage.length = 0
    const { parts, done } = await world.gateway.stream('ada', 'guide-assistant', {
      messages: [{ role: 'user', content: 'hello' }],
    })
    let text = ''
    for await (const part of parts) if (part.type === 'text') text += part.delta
    await done
    expect(text).toBe('OK')
    expect(world.usage).toEqual([expect.objectContaining({ outcome: 'success', outputTokens: 2 })])
  })

  it('records a stream the caller stopped reading as cancelled, once', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    world.usage.length = 0
    const { parts, done } = await world.gateway.stream('ada', 't', { prompt: 'x' })
    for await (const _part of parts) break
    expect(world.usage.map((e) => e.outcome)).toEqual(['cancelled'])
    void done
  })

  it('never leaves a failed stream as an unhandled rejection', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    world.usage.length = 0
    world.model.failNext('RATE_LIMITED')
    const unhandled: unknown[] = []
    const listener = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', listener)
    const { parts } = await world.gateway.stream('ada', 't', { prompt: 'x' })
    await expect(
      (async () => {
        for await (const _part of parts) {
          // reading only the text
        }
      })(),
    ).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', listener)
    expect(unhandled).toEqual([])
    expect(world.usage.map((e) => e.outcome)).toEqual(['RATE_LIMITED'])
  })

  it('brings back the provider step after an authorisation failure on a real call (FR-009)', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    world.model.failNext('PERMISSION_DENIED')
    await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
    expect(await world.queries.gate('ada')).toEqual({ required: true, status: 'needs-attention' })
  })

  it('shows the model calls use now, even after the deployer changed it', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    const later = aiWorld()
    later.connections.set('ada', world.connections.get('ada') ?? ({} as never))
    ;(later.deps.config.models as Record<string, string>).openai = 'o-model-2'
    expect((await later.queries.page('ada')).connection?.model).toBe('o-model-2')
    await later.gateway.generateText('ada', 't', { prompt: 'x' })
    expect(later.usage.at(-1)?.model).toBe('o-model-2')
  })

  it('treats a provider the deployer stopped offering as none', async () => {
    await world.commands.connectApiKey({ actor: ada, provider: 'openai', apiKey: 'sk-ada-1234' })
    const later = aiWorld({ offered: ['anthropic'] })
    later.connections.set('ada', world.connections.get('ada') ?? ({} as never))
    expect(await later.queries.gate('ada')).toEqual({ required: true, status: 'none' })
  })
})
