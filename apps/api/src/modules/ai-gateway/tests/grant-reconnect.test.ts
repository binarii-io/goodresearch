import { beforeEach, describe, expect, it } from 'vitest'
import { aiWorld } from './fakes/in-memory-ai.ts'

const ada = { id: 'ada' }
let world: ReturnType<typeof aiWorld>

const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? ''

/** A working Vertex AI connection on `my-research-1`, `europe-west1`. */
const connectVertex = async () => {
  const start = await world.commands.startGoogleGrant({ actor: ada, returnTo: '/' })
  if (!start.ok) throw new Error('start failed')
  await world.commands.completeGoogleGrant({
    actor: ada,
    state: stateOf(start.value.url),
    code: 'g1',
  })
  await world.commands.checkVertex({ actor: ada, project: 'my-research-1', region: 'europe-west1' })
}

/** Google refuses the grant on a real call. */
const refuse = async (problem: 'refused' | 'reauth-required') => {
  world.model.failNext('INVALID_CREDENTIAL', undefined, problem)
  await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
}

const reconnect = async (code: string) => {
  const start = await world.commands.startGoogleReconnect({
    actor: ada,
    returnTo: '/studies/s1',
    popup: true,
  })
  if (!start.ok) throw new Error('start failed')
  return world.commands.completeGoogleGrant({ actor: ada, state: stateOf(start.value.url), code })
}

beforeEach(async () => {
  world = aiWorld()
  await connectVertex()
})

describe('spec 030 — a refused grant is recorded with its reason', () => {
  it('keeps the reason, the project and the region, and costs nothing', async () => {
    await refuse('reauth-required')
    expect(world.connections.get('ada')).toMatchObject({
      status: 'needs-attention',
      lastFailure: 'INVALID_CREDENTIAL',
      grantProblem: 'reauth-required',
      project: 'my-research-1',
      region: 'europe-west1',
    })
    expect(world.usage.at(-1)).toMatchObject({
      outcome: 'INVALID_CREDENTIAL',
      inputTokens: null,
      outputTokens: null,
    })
  })

  it('does not send the person to the setup for a grant problem (gate)', async () => {
    await refuse('refused')
    expect(await world.queries.gate('ada')).toMatchObject({
      required: true,
      status: 'needs-attention',
      grantProblem: 'refused',
    })
  })

  it('marks a grant the app can no longer read as unreadable', async () => {
    const c = world.connections.get('ada')
    if (!c) throw new Error('no connection')
    world.connections.set('ada', { ...c, encryptedCredential: 'v2:broken' })
    await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
    expect(world.connections.get('ada')?.grantProblem).toBe('unreadable')
  })

  it('has no grant problem for a provider the deployer stopped offering', async () => {
    await refuse('refused')
    const later = aiWorld({ offered: ['anthropic'] })
    later.connections.set('ada', world.connections.get('ada') ?? ({} as never))
    expect(await later.queries.gate('ada')).toMatchObject({
      required: true,
      status: 'none',
      grantProblem: null,
    })
  })

  it('keeps other authorisation failures without a grant problem', async () => {
    world.model.failNext('PERMISSION_DENIED')
    await expect(world.gateway.generateText('ada', 't', { prompt: 'x' })).rejects.toThrow()
    expect(world.connections.get('ada')?.grantProblem).toBeNull()
  })
})

describe('spec 030 US1 — reconnect in one click', () => {
  it('needs a saved Vertex AI connection', async () => {
    world.connections.delete('ada')
    expect(
      await world.commands.startGoogleReconnect({ actor: ada, returnTo: '/', popup: true }),
    ).toEqual({ ok: false, error: 'AI_PROVIDER_REQUIRED' })
  })

  it('opens Google on the saved account', async () => {
    const start = await world.commands.startGoogleReconnect({
      actor: ada,
      returnTo: 'https://elsewhere.example/x',
      popup: true,
    })
    if (!start.ok) throw new Error('start failed')
    expect(new URL(start.value.url).searchParams.get('login_hint')).toBe('ada@example.org')
    expect(world.states.get(stateOf(start.value.url))).toMatchObject({
      mode: 'reconnect',
      popup: true,
      returnTo: '/',
    })
  })

  it('checks the saved project and region again and saves without any form', async () => {
    await refuse('reauth-required')
    const before = world.usage.length
    expect(await reconnect('r1')).toEqual({
      ok: true,
      value: {
        returnTo: '/studies/s1',
        mode: 'reconnect',
        popup: true,
        result: 'reconnected',
        // No price for the test model: unknown, never shown as free.
        cost: null,
      },
    })
    const c = world.connections.get('ada')
    expect(c).toMatchObject({
      status: 'working',
      lastFailure: null,
      grantProblem: null,
      project: 'my-research-1',
      region: 'europe-west1',
    })
    expect(world.deps.cipher.decrypt(c?.encryptedCredential ?? '', 'ada')).toBe('refresh-r1')
    expect(world.grants.has('ada')).toBe(false)
    // The real call of the checks is recorded, so its cost can be shown.
    expect(world.usage.slice(before).map((e) => e.task)).toEqual(['provider-check'])
  })

  it('keeps the previous connection and opens the setup when a check fails', async () => {
    await refuse('refused')
    world.google.cloud.state = 'disabled'
    const result = await reconnect('r2')
    expect(result.ok && result.value.result).toBe('checks-failed')
    expect(world.connections.get('ada')).toMatchObject({
      status: 'needs-attention',
      grantProblem: 'refused',
    })
    expect(
      world.deps.cipher.decrypt(world.grants.get('ada')?.encryptedRefreshToken ?? '', 'ada'),
    ).toBe('refresh-r2')
  })

  it('never accepts another Google account on the one-click path', async () => {
    await refuse('refused')
    world.google.cloud.email = 'someone-else@example.org'
    const result = await reconnect('r3')
    expect(result.ok && result.value.result).toBe('other-account')
    expect(world.connections.get('ada')).toMatchObject({ status: 'needs-attention' })
    expect(
      world.deps.cipher.decrypt(world.connections.get('ada')?.encryptedCredential ?? '', 'ada'),
    ).toBe('refresh-g1')
  })

  it('takes the account for a connection saved without its address', async () => {
    const c = world.connections.get('ada')
    if (!c) throw new Error('fixture')
    world.connections.set('ada', { ...c, googleAccount: null })
    await refuse('refused')
    const result = await reconnect('r4')
    expect(result.ok && result.value.result).toBe('reconnected')
    expect(world.connections.get('ada')?.googleAccount).toBe('ada@example.org')
  })

  it('ends on the pop-up page even when Google fails the exchange', async () => {
    await refuse('refused')
    const result = await reconnect('boom')
    expect(result.ok && result.value.result).toBe('error')
    expect(world.connections.get('ada')?.grantProblem).toBe('refused')
  })

  it('saves nothing when the needed right was unticked', async () => {
    await refuse('refused')
    const result = await reconnect('no-scope')
    expect(result.ok && result.value.result).toBe('missing-right')
    expect(world.grants.has('ada')).toBe(false)
    expect(world.connections.get('ada')?.grantProblem).toBe('refused')
  })

  it('tells where to go back when Google was left without consent', async () => {
    const start = await world.commands.startGoogleReconnect({
      actor: ada,
      returnTo: '/studies/s1',
      popup: false,
    })
    if (!start.ok) throw new Error('start failed')
    expect(
      await world.commands.abandonGoogleGrant({ actor: ada, state: stateOf(start.value.url) }),
    ).toEqual({ ok: true, value: { returnTo: '/studies/s1', mode: 'reconnect', popup: false } })
    expect(
      await world.commands.abandonGoogleGrant({ actor: ada, state: stateOf(start.value.url) }),
    ).toEqual({ ok: false, error: 'VALIDATION' })
  })
})

describe('spec 030 US4 — session check', () => {
  it('clears a problem when Google gives a token again', async () => {
    await refuse('refused')
    expect(await world.commands.checkGrant({ actor: ada })).toEqual({
      ok: true,
      value: { state: 'ok' },
    })
    expect(world.connections.get('ada')).toMatchObject({ status: 'working', grantProblem: null })
  })

  it('records a refused grant without any AI call', async () => {
    world.google.cloud.revokedGrant = 'reauth-required'
    const before = world.usage.length
    expect(await world.commands.checkGrant({ actor: ada })).toEqual({
      ok: true,
      value: {
        state: 'problem',
        grantProblem: 'reauth-required',
      },
    })
    expect(world.connections.get('ada')?.grantProblem).toBe('reauth-required')
    expect(world.usage.length).toBe(before)
  })

  it('never takes an unreachable Google for a refused grant', async () => {
    world.google.cloud.unreachable = true
    expect(await world.commands.checkGrant({ actor: ada })).toEqual({
      ok: true,
      value: { state: 'unreachable' },
    })
    expect(world.connections.get('ada')).toMatchObject({ status: 'working', grantProblem: null })
  })

  it('has nothing to check without a Vertex AI connection', async () => {
    world.connections.delete('ada')
    expect(await world.commands.checkGrant({ actor: ada })).toEqual({
      ok: true,
      value: { state: 'none' },
    })
  })
})

describe('spec 038 — the video bucket token of a refused grant', () => {
  it('brings the provider step back, as a refused call does', async () => {
    world.google.cloud.revokedGrant = 'reauth-required'
    await expect(world.gateway.googleAccessFor('ada')).rejects.toMatchObject({
      failure: 'INVALID_CREDENTIAL',
    })
    expect(world.connections.get('ada')).toMatchObject({
      status: 'needs-attention',
      grantProblem: 'reauth-required',
    })
  })
})
