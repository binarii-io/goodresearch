import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeCreateProject } from '../application/commands/create-project.ts'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makeRenameProject } from '../application/commands/rename-project.ts'
import { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const admin = { id: 'admin', role: 'admin' as const }
const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }

describe('project commands', () => {
  let research: InMemoryResearch
  let deps: ReturnType<InMemoryResearch['deps']>

  beforeEach(() => {
    research = new InMemoryResearch({
      teams: ['team-a', 'team-b', 'team-c'],
      memberships: { alice: ['team-a', 'team-b'], bob: [] },
      admins: ['admin'],
    })
    deps = research.deps(fixedClock(new Date('2026-10-24T10:00:00Z')))
  })

  const createIn = async (teamId: string, actor = alice) => {
    const result = await makeCreateProject(deps)({ actor, name: 'Study', goal: 'Why?', teamId })
    if (!result.ok) throw new Error(result.error)
    return result.value.id
  }

  describe('create-project', () => {
    it('creates a project in one of the actor teams', async () => {
      const id = await createIn('team-a')
      expect(research.projects.get(id)?.teamId).toBe('team-a')
    })

    it('refuses a team the member is not in, as if it did not exist', async () => {
      expect(
        await makeCreateProject(deps)({ actor: alice, name: 'Study', goal: '', teamId: 'team-c' }),
      ).toEqual({
        ok: false,
        error: 'TEAM_NOT_FOUND',
      })
    })

    it('lets admins create in any existing team, but not in a missing one', async () => {
      expect(
        (await makeCreateProject(deps)({ actor: admin, name: 'Study', goal: '', teamId: 'team-c' }))
          .ok,
      ).toBe(true)
      expect(
        await makeCreateProject(deps)({ actor: admin, name: 'Study', goal: '', teamId: 'nope' }),
      ).toEqual({
        ok: false,
        error: 'TEAM_NOT_FOUND',
      })
    })

    it('refuses an invalid name', async () => {
      expect(
        await makeCreateProject(deps)({ actor: alice, name: ' ', goal: '', teamId: 'team-a' }),
      ).toEqual({
        ok: false,
        error: 'VALIDATION',
      })
    })
  })

  describe('edits', () => {
    it('renames and increments the version', async () => {
      const id = await createIn('team-a')
      expect(
        await makeRenameProject(deps)({ actor: alice, projectId: id, name: 'Renamed', version: 0 }),
      ).toEqual({
        ok: true,
        value: { version: 1 },
      })
      expect(research.projects.get(id)?.name).toBe('Renamed')
    })

    it('refuses an edit based on an outdated version', async () => {
      const id = await createIn('team-a')
      await makeUpdateProjectGoal(deps)({ actor: alice, projectId: id, goal: 'First', version: 0 })
      expect(
        await makeUpdateProjectGoal(deps)({
          actor: alice,
          projectId: id,
          goal: 'Second',
          version: 0,
        }),
      ).toEqual({
        ok: false,
        error: 'VERSION_CONFLICT',
      })
      expect(research.projects.get(id)?.goal).toBe('First')
    })

    it('hides projects of other teams', async () => {
      const id = await createIn('team-a')
      expect(
        await makeRenameProject(deps)({ actor: bob, projectId: id, name: 'Mine', version: 0 }),
      ).toEqual({
        ok: false,
        error: 'PROJECT_NOT_FOUND',
      })
    })

    it('moves a project only to a team the actor can access', async () => {
      const id = await createIn('team-a')
      expect(
        await makeMoveProjectToTeam(deps)({
          actor: alice,
          projectId: id,
          teamId: 'team-c',
          version: 0,
        }),
      ).toEqual({
        ok: false,
        error: 'TEAM_NOT_FOUND',
      })
      expect(
        (
          await makeMoveProjectToTeam(deps)({
            actor: alice,
            projectId: id,
            teamId: 'team-b',
            version: 0,
          })
        ).ok,
      ).toBe(true)
      expect(research.projects.get(id)?.teamId).toBe('team-b')
    })
  })
})
