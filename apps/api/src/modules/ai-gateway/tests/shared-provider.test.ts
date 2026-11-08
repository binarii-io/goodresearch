import { describe, expect, it } from 'vitest'
import { AiProviderRequired } from '../application/gateway.ts'
import { ProviderCallError } from '../application/ports.ts'
import { makeEstimateCost } from '../application/queries/usage-costs.ts'
import { aiWorld } from './fakes/in-memory-ai.ts'

const ada = { id: 'ada' }

/** The instance's shared Vertex AI, by its own Google Cloud identity (made-up project). */
const sharedVertex = (teams: readonly string[] | null = null) => ({
  credential: {
    provider: 'vertex' as const,
    serviceAccount: 'instance' as const,
    project: 'example-shared',
    region: 'global',
  },
  model: 'shared-model',
  teams,
})

describe('spec 035 — a shared AI provider for the instance', () => {
  it('serves a person without a provider: no setup asked, the call recorded as shared', async () => {
    const world = aiWorld({ shared: sharedVertex() })
    expect(await world.queries.gate('ada')).toMatchObject({
      required: false,
      status: 'none',
      grantProblem: null,
    })
    expect(await world.gateway.providerOf('ada')).toBe('vertex')
    await world.gateway.generateText('ada', 'guide', { prompt: 'x' })
    expect(world.model.calls.at(-1)?.credential).toMatchObject({ serviceAccount: 'instance' })
    expect(world.usage.at(-1)).toMatchObject({
      accountId: 'ada',
      provider: 'vertex',
      model: 'shared-model',
      shared: true,
      outcome: 'success',
    })
  })

  it("prefers the person's own provider, and goes back to the shared one when it is removed", async () => {
    const world = aiWorld({ shared: sharedVertex() })
    const own = await world.commands.connectApiKey({
      actor: ada,
      provider: 'anthropic',
      apiKey: 'sk-made-up-own',
    })
    expect(own.ok).toBe(true)
    await world.gateway.generateText('ada', 'guide', { prompt: 'x' })
    expect(world.usage.at(-1)).toMatchObject({ provider: 'anthropic', shared: false })
    expect((await world.queries.page('ada')).serving).toBe('own')
    await world.commands.removeProvider({ actor: ada })
    await world.gateway.generateText('ada', 'guide', { prompt: 'x' })
    expect(world.usage.at(-1)).toMatchObject({ provider: 'vertex', shared: true })
    const page = await world.queries.page('ada')
    expect(page.serving).toBe('shared')
    // The usage shown is the shared provider's only.
    expect(page.usage.calls).toBe(1)
  })

  it('keeps asking a person whose own provider needs attention, never switching silently', async () => {
    const world = aiWorld({ shared: sharedVertex() })
    await world.commands.connectApiKey({ actor: ada, provider: 'anthropic', apiKey: 'sk-own' })
    world.model.failNext('INVALID_CREDENTIAL')
    await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
    world.model.failNext('INVALID_CREDENTIAL')
    await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
    expect(world.model.calls.at(-1)?.credential.provider).toBe('anthropic')
    expect((await world.queries.gate('ada')).status).toBe('needs-attention')
  })

  it("logs a shared provider's failure for the deployer, never marks the person, and says it is the instance's", async () => {
    const world = aiWorld({
      shared: {
        credential: { provider: 'anthropic', apiKey: 'sk-example-shared-key' },
        model: 'shared-model',
        teams: null,
      },
    })
    for (const failure of ['INVALID_CREDENTIAL', 'NO_CREDIT_OR_QUOTA', 'API_DISABLED'] as const) {
      world.model.failNext(failure)
      const error = await world.gateway
        .generateText('ada', 't', { prompt: 'x' })
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ProviderCallError)
      expect((error as ProviderCallError).failure).toBe('SHARED_PROVIDER_UNAVAILABLE')
      // The ledger keeps what the provider said.
      expect(world.usage.at(-1)).toMatchObject({ outcome: failure, shared: true })
    }
    expect(world.connections.get('ada')).toBeUndefined()
    expect(world.warnings.map((w) => w.object)).toContainEqual(
      expect.objectContaining({ failure: 'INVALID_CREDENTIAL', provider: 'anthropic' }),
    )
    expect(JSON.stringify(world.warnings)).not.toContain('example-shared-key')
    // A rate limit stays a rate limit: try again later.
    world.model.failNext('RATE_LIMITED')
    const limited = await world.gateway
      .generateObject('ada', 't', {
        prompt: 'x',
        schema: { parse: (v: unknown) => v } as never,
      })
      .catch((e: unknown) => e)
    expect((limited as ProviderCallError).failure).toBe('RATE_LIMITED')
    // Streams too.
    world.model.failNext('PERMISSION_DENIED')
    const streamed = await world.gateway.stream('ada', 't', { prompt: 'x' })
    // Read from the parts first (as the assistant does), the failure is the instance's too.
    await expect(
      (async () => {
        for await (const _ of streamed.parts);
      })(),
    ).rejects.toMatchObject({ failure: 'SHARED_PROVIDER_UNAVAILABLE' })
    await expect(streamed.done).rejects.toMatchObject({ failure: 'SHARED_PROVIDER_UNAVAILABLE' })
    expect(world.warnings.filter((w) => (w.object as { task?: string }).task === 't').length).toBe(
      5,
    )
  })

  it('shows the shared provider on the page, never its credentials', async () => {
    const world = aiWorld({
      shared: {
        credential: { provider: 'anthropic', apiKey: 'sk-example-shared-key' },
        model: 'shared-model',
        teams: null,
      },
    })
    const page = await world.queries.page('ada')
    expect(page.shared).toEqual({ provider: 'anthropic', model: 'shared-model', open: true })
    expect(page.serving).toBe('shared')
    expect(JSON.stringify(page)).not.toContain('sk-example-shared-key')
  })

  it('is open only to the members of the listed teams', async () => {
    const world = aiWorld({
      shared: sharedVertex(['team-a']),
      teams: { ada: ['team-a'], bob: ['team-b'] },
    })
    expect((await world.queries.gate('ada')).required).toBe(false)
    expect((await world.queries.gate('bob')).required).toBe(true)
    expect(await world.gateway.providerOf('bob')).toBeNull()
    await expect(world.gateway.generateText('bob', 't', { prompt: 'x' })).rejects.toBeInstanceOf(
      AiProviderRequired,
    )
    const page = await world.queries.page('bob')
    expect(page.shared).toMatchObject({ open: false })
    expect(page.serving).toBeNull()
  })

  it('estimates costs with the model of the shared provider', async () => {
    const world = aiWorld({ shared: sharedVertex() })
    const prices = [
      { model: 'shared-model', from: '2026-01-01', inputPerMillion: 1, outputPerMillion: 2 },
    ]
    const estimate = makeEstimateCost({ ...world.deps, config: { ...world.deps.config, prices } })
    expect(await estimate('ada', 4_000_000, 1_000_000)).toBeCloseTo(3)
  })

  it('changes nothing without a shared provider', async () => {
    const world = aiWorld()
    expect(await world.queries.gate('ada')).toMatchObject({ required: true, status: 'none' })
    expect((await world.queries.page('ada')).shared).toBeNull()
  })
})
