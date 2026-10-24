import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDeleteTeam } from '../application/commands/delete-team.ts'
import { makeRenameTeam } from '../application/commands/rename-team.ts'
import { InMemoryWorkspace } from './fakes/in-memory-workspace.ts'

const admin = { id: 'admin-1', role: 'admin' as const }
const member = { id: 'member-1', role: 'member' as const }

describe('team commands', () => {
  let workspace: InMemoryWorkspace
  let projectCounts: Record<string, number>
  const clock = fixedClock(new Date('2026-10-24T10:00:00Z'))

  beforeEach(() => {
    workspace = new InMemoryWorkspace()
    workspace.addAccount({ id: 'admin-1', role: 'admin' })
    workspace.addAccount({ id: 'member-1', teamIds: ['team-a'] })
    workspace.addTeam({ id: 'team-a', name: 'Research' })
    workspace.addTeam({ id: 'team-b', name: 'Growth' })
    projectCounts = {}
  })

  const renameTeam = () => makeRenameTeam({ uow: workspace.uow, clock })
  const deleteTeam = () =>
    makeDeleteTeam({
      uow: workspace.uow,
      clock,
      projects: { countByTeam: async (id) => projectCounts[id] ?? 0 },
    })

  it('renames a team and refuses a name already taken', async () => {
    expect(
      await renameTeam()({ actor: admin, teamId: 'team-a', name: 'Insights', version: 0 }),
    ).toEqual({
      ok: true,
      value: { version: 1 },
    })
    expect(
      await renameTeam()({ actor: admin, teamId: 'team-a', name: ' growth ', version: 1 }),
    ).toEqual({
      ok: false,
      error: 'TEAM_NAME_TAKEN',
    })
    expect(
      await renameTeam()({ actor: admin, teamId: 'team-a', name: 'Again', version: 0 }),
    ).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('refuses to delete a team that still has projects', async () => {
    projectCounts['team-a'] = 3
    expect(await deleteTeam()({ actor: admin, teamId: 'team-a' })).toEqual({
      ok: false,
      error: 'TEAM_HAS_PROJECTS',
      detail: { projectCount: 3 },
    })
  })

  it('deletes an empty team, removing memberships with access events', async () => {
    expect(await deleteTeam()({ actor: admin, teamId: 'team-a' })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(workspace.teams.has('team-a')).toBe(false)
    expect(workspace.accounts.get('member-1')?.teamIds).toEqual([])
    expect(workspace.events).toMatchObject([
      {
        type: 'membership_removed',
        subjectId: 'member-1',
        details: { teamId: 'team-a', teamName: 'Research' },
      },
    ])
  })

  it('is admin only', async () => {
    expect(await deleteTeam()({ actor: member, teamId: 'team-a' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    })
    expect(await renameTeam()({ actor: member, teamId: 'team-a', name: 'X', version: 0 })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    })
  })
})
