import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startWorld, type World } from './support/world.ts'

describe('deleting a project (spec 020)', () => {
  let world: World
  let admin: { cookie: string; id: string }
  let alex: { cookie: string; id: string }
  let casey: { cookie: string; id: string }
  let team: string

  beforeAll(async () => {
    world = await startWorld()
    admin = await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
    casey = await world.session('casey@research.example.com')
    team = await world.team('Research')
    await world.addMember(alex.id, team)
    await world.addMember(casey.id, team)
  })

  afterAll(async () => {
    await world?.close()
  })

  const call = (who: { cookie: string }, method: 'GET' | 'POST', url: string, payload?: object) =>
    world.app.inject({
      method,
      url,
      headers: { cookie: who.cookie },
      ...(payload ? { payload } : {}),
    })
  const project = async (name: string) =>
    (await call(alex, 'POST', '/api/projects', { name, goal: '', teamId: team })).json<{
      id: string
    }>().id
  const study = async (projectId: string, name: string) =>
    (
      await call(alex, 'POST', `/api/projects/${projectId}/studies`, { name, type: 'interviews' })
    ).json<{ id: string }>().id

  it('leaves the studies, and needs the rights and the exact name', async () => {
    const gone = await project('To delete')
    const other = await project('Other')
    const own = await study(gone, 'Own study')
    const shared = await study(gone, 'Shared study')
    await call(alex, 'POST', `/api/projects/${other}/studies/${shared}/link`)

    expect((await call(alex, 'GET', `/api/projects/${gone}`)).json()).toMatchObject({
      canDelete: true,
    })
    expect((await call(casey, 'GET', `/api/projects/${gone}`)).json()).toMatchObject({
      canDelete: false,
    })
    expect((await call(admin, 'GET', `/api/projects/${gone}`)).json()).toMatchObject({
      canDelete: true,
    })
    expect((await call(casey, 'GET', `/api/projects/${gone}/deletion`)).statusCode).toBe(403)
    expect((await call(alex, 'GET', `/api/projects/${gone}/deletion`)).json()).toEqual({
      insights: 0,
      recommendations: 0,
      hasTakeaways: false,
      hasPublishedDeck: false,
      studies: 2,
      studiesWithoutProject: 1,
    })

    const remove = (who: { cookie: string }, name: string) =>
      call(who, 'POST', `/api/projects/${gone}/delete`, { name })
    expect((await remove(casey, 'To delete')).statusCode).toBe(403)
    expect((await remove(alex, 'to delete')).statusCode).toBe(422)
    expect((await call(alex, 'GET', `/api/projects/${gone}`)).statusCode).toBe(200)

    expect((await remove(alex, ' To delete ')).statusCode).toBe(204)
    expect((await call(alex, 'GET', `/api/projects/${gone}`)).statusCode).toBe(404)
    expect((await remove(alex, 'To delete')).statusCode).toBe(404)
    expect((await call(alex, 'GET', `/api/studies/${own}`)).json()).toMatchObject({ projects: [] })
    expect((await call(alex, 'GET', `/api/studies/${shared}`)).json()).toMatchObject({
      projects: [{ id: other }],
    })
    const list = (await call(alex, 'GET', `/api/teams/${team}/studies`)).json<{
      studies: { id: string }[]
    }>()
    expect(list.studies.map((s) => s.id)).toEqual(expect.arrayContaining([own, shared]))
  })
})
