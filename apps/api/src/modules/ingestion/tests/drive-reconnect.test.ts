import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryIngestion } from './fakes/in-memory-ingestion.ts'

const alice = { id: 'alice', role: 'member' as const }
let world: InMemoryIngestion

const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? ''

const connect = async (access: 'read' | 'write' = 'read') => {
  const started = await world.commands.startDriveConnection({ actor: alice, returnTo: '/', access })
  if (!started.ok) throw new Error(started.error)
  await world.commands.completeDriveConnection({
    actor: alice,
    state: stateOf(started.value.url),
    code: 'code',
  })
}

/** Google refuses the saved grant; the session check notices it. */
const refuse = async (reason: 'refused' | 'reauth-required') => {
  const token = world.store.connections.get('alice')?.encryptedRefreshToken ?? ''
  world.drive.refuse(world.deps.cipher.decrypt(token, 'alice'), reason)
  await world.commands.checkDriveGrant({ actor: alice })
}

const reconnect = async (popup = true) => {
  const started = await world.commands.startDriveReconnect({
    actor: alice,
    returnTo: '/studies/study-1',
    popup,
  })
  if (!started.ok) throw new Error(started.error)
  return world.commands.completeDriveConnection({
    actor: alice,
    state: stateOf(started.value.url),
    code: 'code',
  })
}

beforeEach(async () => {
  world = new InMemoryIngestion(fixedClock(new Date('2026-10-24T10:00:00Z')))
  world.drive.nextConsentAccount = 'alice@example.org'
  await connect()
})

describe('spec 030 — a refused Drive grant keeps its reason', () => {
  it('marks the connection lost with the reason', async () => {
    await refuse('reauth-required')
    expect(world.store.connections.get('alice')).toMatchObject({
      status: 'lost',
      lostReason: 'reauth-required',
    })
    const [mine] = await world.queries.mySources(alice)
    expect(mine).toMatchObject({ status: 'lost', grantProblem: 'reauth-required' })
  })

  it('marks a grant the app can no longer read as unreadable', async () => {
    const c = world.store.connections.get('alice')
    if (!c) throw new Error('fixture')
    world.store.connections.set('alice', { ...c, encryptedRefreshToken: 'v2:broken' })
    expect(await world.commands.checkDriveGrant({ actor: alice })).toEqual({
      ok: true,
      value: {
        state: 'problem',
        grantProblem: 'unreadable',
      },
    })
    expect(world.store.connections.get('alice')?.lostReason).toBe('unreadable')
  })
})

describe('spec 030 US3 — reconnect Drive in one click', () => {
  it('needs a saved connection', async () => {
    world.store.connections.delete('alice')
    expect(
      await world.commands.startDriveReconnect({ actor: alice, returnTo: '/', popup: true }),
    ).toEqual({ ok: false, error: 'DRIVE_NOT_CONNECTED' })
  })

  it('asks the same account for the same access', async () => {
    world.store.connections.delete('alice')
    await connect('write')
    await refuse('refused')
    const started = await world.commands.startDriveReconnect({
      actor: alice,
      returnTo: '/studies/study-1',
      popup: true,
    })
    if (!started.ok) throw new Error(started.error)
    expect(new URL(started.value.url).searchParams.get('login_hint')).toBe('alice@example.org')
    expect(world.store.states.get(stateOf(started.value.url))).toMatchObject({
      access: 'write',
      mode: 'reconnect',
      popup: true,
    })
  })

  it('replaces the grant and keeps the folder access checks', async () => {
    await refuse('refused')
    world.store.access.set('study-1:alice', {
      result: { kind: 'granted' } as never,
      checkedAt: new Date(),
    })
    expect(await reconnect()).toEqual({
      ok: true,
      value: {
        returnTo: '/studies/study-1',
        mode: 'reconnect',
        popup: true,
        result: 'reconnected',
      },
    })
    expect(world.store.connections.get('alice')).toMatchObject({
      status: 'connected',
      lostReason: null,
      externalAccount: 'alice@example.org',
    })
    expect(world.store.access.has('study-1:alice')).toBe(true)
    expect(await world.commands.checkDriveGrant({ actor: alice })).toEqual({
      ok: true,
      value: { state: 'ok' },
    })
  })

  it('never accepts another Google account on the one-click path', async () => {
    await refuse('refused')
    world.drive.nextConsentAccount = 'someone-else@example.org'
    const result = await reconnect()
    expect(result.ok && result.value.result).toBe('other-account')
    expect(world.store.connections.get('alice')).toMatchObject({
      status: 'lost',
      externalAccount: 'alice@example.org',
    })
  })

  it('saves nothing when the needed right was unticked', async () => {
    await refuse('refused')
    world.drive.untickNext = true
    const result = await reconnect(false)
    expect(result.ok && result.value).toMatchObject({ result: 'missing-right', popup: false })
    expect(world.store.connections.get('alice')?.status).toBe('lost')
  })
})

describe('spec 030 US4 — session check', () => {
  it('never takes a Drive outage for a refused grant', async () => {
    world.drive.outage = true
    expect(await world.commands.checkDriveGrant({ actor: alice })).toEqual({
      ok: true,
      value: { state: 'unreachable' },
    })
    expect(world.store.connections.get('alice')?.status).toBe('connected')
  })

  it('has nothing to check without a connection', async () => {
    world.store.connections.delete('alice')
    expect(await world.commands.checkDriveGrant({ actor: alice })).toEqual({
      ok: true,
      value: { state: 'none' },
    })
  })
})
