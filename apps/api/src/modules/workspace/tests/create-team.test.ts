import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeCreateTeam } from '../application/commands/create-team.ts'
import { InMemoryWorkspace } from './fakes/in-memory-workspace.ts'

const admin = { id: 'a1', role: 'admin' as const }
const member = { id: 'm1', role: 'member' as const }

describe('create-team', () => {
  let workspace: InMemoryWorkspace
  let createTeam: ReturnType<typeof makeCreateTeam>

  beforeEach(() => {
    workspace = new InMemoryWorkspace()
    createTeam = makeCreateTeam({
      uow: workspace.uow,
      clock: fixedClock(new Date('2026-10-24T10:00:00Z')),
    })
  })

  it('lets an admin create a team', async () => {
    const result = await createTeam({ actor: admin, name: 'Research' })
    expect(result.ok).toBe(true)
    expect([...workspace.teams.values()].map((t) => t.name)).toEqual(['Research'])
  })

  it('refuses a name that already exists, ignoring case and spaces', async () => {
    await createTeam({ actor: admin, name: 'Growth' })
    expect(await createTeam({ actor: admin, name: 'growth ' })).toEqual({
      ok: false,
      error: 'TEAM_NAME_TAKEN',
    })
  })

  it('refuses members', async () => {
    expect(await createTeam({ actor: member, name: 'Research' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    })
    expect(workspace.teams.size).toBe(0)
  })
})
