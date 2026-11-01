import { newId } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evidenceFacts } from '../src/modules/evidence/infrastructure/schema.ts'
import { ingestionSessions } from '../src/modules/ingestion/infrastructure/schema.ts'
import { startWorld, type World } from './support/world.ts'

/** Spec 017: the Overview's three reads, through the whole composition. */
describe('the project Overview on PostgreSQL', () => {
  let world: World
  let alex: { cookie: string; id: string }
  let outsider: { cookie: string; id: string }
  let projectId: string
  const now = new Date('2026-10-31T10:00:00Z')

  const get = (who: { cookie: string }, url: string) =>
    world.app.inject({ method: 'GET', url, headers: { cookie: who.cookie } })

  beforeAll(async () => {
    world = await startWorld()
    await world.session('admin@example.org')
    alex = await world.session('alex@example.org')
    outsider = await world.session('out@research.example.com')
    const teamId = await world.team('Research')
    await world.addMember(alex.id, teamId)
    const project = await world.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: alex.cookie },
      payload: { name: 'Home', goal: '', teamId },
    })
    projectId = project.json<{ id: string }>().id
    const study = await world.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/studies`,
      headers: { cookie: alex.cookie },
      payload: { name: 'Interviews', type: 'interviews' },
    })
    const studyId = study.json<{ id: string }>().id
    const session = (state: string, name: string) => ({
      id: newId(),
      studyId,
      media: [],
      state,
      roster: [{ id: newId(), name, role: 'interviewee' as const, memberId: null }],
      createdAt: now,
      updatedAt: now,
    })
    const validated = session('validated', 'Sam')
    const excluded = session('excluded', 'Alex')
    await world.db.insert(ingestionSessions).values([validated, excluded])
    const fact = (sessionId: string, status: string) => ({
      id: newId(),
      sessionId,
      studyId,
      statementEn: 'x',
      statementFr: 'x',
      polarity: 'neutral',
      origin: 'ai',
      status,
      createdAt: now,
    })
    await world.db
      .insert(evidenceFacts)
      .values([
        fact(validated.id, 'accepted'),
        fact(validated.id, 'proposed'),
        fact(excluded.id, 'proposed'),
      ])
  })

  afterAll(async () => {
    await world?.close()
  })

  it('counts only the facts of validated interviews, as Analysis does (SC-003)', async () => {
    const response = await get(alex, `/api/projects/${projectId}/overview`)
    expect(response.statusCode).toBe(200)
    const overview = response.json<{
      steps: unknown[]
      nextStep: string
      studies: { counts: object }[]
    }>()
    expect(overview.steps[0]).toMatchObject({ total: 1, validated: 1, participants: 1 })
    expect(overview.steps[1]).toMatchObject({ total: 2, validated: 1, toDecide: 1 })
    expect(overview.nextStep).toBe('facts')
    expect(overview.studies[0]?.counts).toEqual({
      validated: 1,
      toValidate: 0,
      excluded: 1,
      facts: 2,
      factsToDecide: 1,
    })
  })

  it('gives the costs and the freshness apart', async () => {
    const costs = await get(alex, `/api/projects/${projectId}/overview/costs`)
    expect(costs.statusCode).toBe(200)
    expect(costs.json<{ cost: { total: number } }>().cost.total).toBe(0)
    const freshness = await get(alex, `/api/projects/${projectId}/takeaways/freshness`)
    expect(freshness.json()).toEqual({ outOfDate: false })
  })

  it('answers not found to someone without access, on all three', async () => {
    for (const path of ['overview', 'overview/costs', 'takeaways/freshness'])
      expect((await get(outsider, `/api/projects/${projectId}/${path}`)).statusCode).toBe(404)
  })
})
