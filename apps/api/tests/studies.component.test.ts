import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWorld, type World } from './support/world.ts'

type Who = { cookie: string; id: string }

describe('studies API (spec 002 US1)', () => {
  let world: World
  let alex: Who
  let outsider: Who
  let projectId: string

  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })

  beforeAll(async () => {
    world = await startWorld()
    await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
    outsider = await world.session('out@research.example.com')
    const team = await world.team('Research')
    await world.addMember(alex.id, team)
    projectId = (
      await call(alex, 'POST', '/api/projects', { name: 'Onboarding', teamId: team })
    ).json<{ id: string }>().id
  })

  afterAll(async () => {
    await world?.close()
  })

  it('creates interview studies only, lists them most recent first', async () => {
    const created = await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
      name: ' Interviews Q4 ',
      type: 'interviews',
    })
    expect(created.statusCode).toBe(201)
    expect(
      (
        await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
          name: 'Survey',
          type: 'survey',
        })
      ).json(),
    ).toMatchObject({
      code: 'VALIDATION',
    })
    world.clock.advance(1000)
    await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
      name: 'Interviews Q1',
      type: 'interviews',
    })
    const list = (await call(alex, 'GET', `/api/projects/${projectId}/studies`)).json<
      { name: string; folderName: null }[]
    >()
    expect(list.map((s) => s.name)).toEqual(['Interviews Q1', 'Interviews Q4'])
    expect(list[0]?.folderName).toBeNull()
  })

  it('renames with optimistic concurrency and deletes', async () => {
    const { id } = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Draft',
        type: 'interviews',
      })
    ).json<{ id: string }>()
    expect((await call(alex, 'GET', `/api/studies/${id}`)).json()).toMatchObject({
      name: 'Draft',
      type: 'interviews',
      projects: [{ id: projectId }],
    })
    expect(
      (await call(alex, 'PUT', `/api/studies/${id}/name`, { name: 'Final', version: 0 })).json(),
    ).toEqual({ version: 1 })
    expect(
      (await call(alex, 'PUT', `/api/studies/${id}/name`, { name: 'Late', version: 0 })).json(),
    ).toMatchObject({ code: 'VERSION_CONFLICT' })
    expect((await call(alex, 'DELETE', `/api/studies/${id}`)).statusCode).toBe(204)
    expect((await call(alex, 'GET', `/api/studies/${id}`)).statusCode).toBe(404)
  })

  it('SC-006: outsiders get not found everywhere', async () => {
    const { id } = (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, {
        name: 'Secret',
        type: 'interviews',
      })
    ).json<{ id: string }>()
    for (const [method, url, payload] of [
      ['GET', `/api/projects/${projectId}/studies`, undefined],
      ['POST', `/api/projects/${projectId}/studies`, { name: 'X', type: 'interviews' }],
      ['GET', `/api/studies/${id}`, undefined],
      ['PUT', `/api/studies/${id}/name`, { name: 'X', version: 0 }],
      ['DELETE', `/api/studies/${id}`, undefined],
      ['GET', `/api/studies/${id}/source`, undefined],
      ['PUT', `/api/studies/${id}/source`, { link: 'folder-interviews' }],
    ] as const) {
      expect((await call(outsider, method, url, payload)).statusCode).toBe(404)
    }
  })
})
