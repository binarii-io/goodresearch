import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWorld, type World } from './support/world.ts'

describe('projects API', () => {
  let world: World
  let admin: { cookie: string; id: string }
  let alex: { cookie: string; id: string }
  let teamA: string
  let teamB: string

  beforeAll(async () => {
    world = await startWorld()
    admin = await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
    teamA = await world.team('Research')
    teamB = await world.team('Growth')
    await world.addMember(alex.id, teamA)
  })

  afterAll(async () => {
    await world?.close()
  })

  const call = (
    who: { cookie: string },
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  it('creates a project and returns its overview', async () => {
    const created = await call(alex, 'POST', '/api/projects', {
      name: '  Onboarding  ',
      goal: 'Why?\nHow?',
      teamId: teamA,
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json<{ id: string }>()
    const detail = await call(alex, 'GET', `/api/projects/${id}`)
    expect(detail.json()).toMatchObject({
      name: 'Onboarding',
      goal: 'Why?\nHow?',
      team: { id: teamA, name: 'Research' },
      version: 0,
    })
  })

  it('rejects invalid input with field errors', async () => {
    const response = await call(alex, 'POST', '/api/projects', { name: '', teamId: teamA })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ code: 'VALIDATION', errors: [{ path: 'name' }] })
  })

  it('lists projects most recently updated first, filterable by team', async () => {
    world.clock.advance(1000)
    await call(admin, 'POST', '/api/projects', { name: 'Pricing', teamId: teamB })
    world.clock.advance(1000)
    await call(admin, 'POST', '/api/projects', { name: 'Search', teamId: teamA })
    const all = await call(admin, 'GET', '/api/projects')
    expect(all.json<{ name: string }[]>().map((p) => p.name)).toEqual([
      'Search',
      'Pricing',
      'Onboarding',
    ])
    const filtered = await call(admin, 'GET', `/api/projects?team=${teamB}`)
    expect(filtered.json<{ name: string }[]>().map((p) => p.name)).toEqual(['Pricing'])
  })

  it('shows members only the projects of their teams, and hides the others as not found', async () => {
    const list = await call(alex, 'GET', '/api/projects')
    expect(list.json<{ name: string }[]>().map((p) => p.name)).toEqual(['Search', 'Onboarding'])
    const pricing = (await call(admin, 'GET', `/api/projects?team=${teamB}`)).json<
      { id: string }[]
    >()[0]
    const hidden = await call(alex, 'GET', `/api/projects/${pricing?.id}`)
    expect(hidden.statusCode).toBe(404)
    expect(hidden.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })

  it('refuses a stale edit with VERSION_CONFLICT', async () => {
    const { id } = (
      await call(alex, 'POST', '/api/projects', { name: 'Draft', teamId: teamA })
    ).json<{ id: string }>()
    expect(
      (await call(alex, 'PUT', `/api/projects/${id}/name`, { name: 'First', version: 0 })).json(),
    ).toEqual({ version: 1 })
    const stale = await call(alex, 'PUT', `/api/projects/${id}/goal`, { goal: 'Late', version: 0 })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('moves a project only to an accessible team', async () => {
    const { id } = (
      await call(alex, 'POST', '/api/projects', { name: 'Mobile', teamId: teamA })
    ).json<{ id: string }>()
    const refused = await call(alex, 'PUT', `/api/projects/${id}/team`, {
      teamId: teamB,
      version: 0,
    })
    expect(refused.json()).toMatchObject({ code: 'TEAM_NOT_FOUND' })
    const moved = await call(admin, 'PUT', `/api/projects/${id}/team`, {
      teamId: teamB,
      version: 0,
    })
    expect(moved.statusCode).toBe(200)
    expect((await call(alex, 'GET', `/api/projects/${id}`)).statusCode).toBe(404)
  })
})
