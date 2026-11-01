import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeDeleteProject } from '../application/commands/delete-project.ts'
import { Project } from '../domain/project.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const project = (createdBy: string | null = 'carla') => {
  const created = Project.create({
    id: 'p1',
    teamId: 'team-a',
    name: 'Été 2026',
    goal: '',
    createdBy,
    now: new Date(0),
  })
  if (!created.ok) throw new Error('fixture')
  return created.value
}

describe('spec 020 — who can delete a project', () => {
  it('lets an admin and the creator, nobody else', () => {
    expect(project().canBeDeletedBy({ id: 'root', role: 'admin' })).toBe(true)
    expect(project().canBeDeletedBy({ id: 'carla', role: 'member' })).toBe(true)
    expect(project().canBeDeletedBy({ id: 'alice', role: 'member' })).toBe(false)
  })

  it('leaves a project without a creator to admins', () => {
    expect(project(null).canBeDeletedBy({ id: 'alice', role: 'member' })).toBe(false)
    expect(project(null).canBeDeletedBy({ id: 'root', role: 'admin' })).toBe(true)
  })
})

describe('spec 020 — confirming with the name', () => {
  it('takes the exact name, apart from spaces at both ends', () => {
    expect(project().confirms('Été 2026')).toBe(true)
    expect(project().confirms('  Été 2026 ')).toBe(true)
    expect(project().confirms('été 2026')).toBe(false)
    expect(project().confirms('Ete 2026')).toBe(false)
    expect(project().confirms('')).toBe(false)
  })
})

describe('spec 020 — deleting a project', () => {
  const carla = { id: 'carla', role: 'member' as const }
  let research: InMemoryResearch
  let remove: ReturnType<typeof makeDeleteProject>

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a'],
      memberships: { carla: ['team-a'], alice: ['team-a'], bob: [] },
      admins: ['root'],
    })
    remove = makeDeleteProject({
      ...research.deps(fixedClock(new Date(0))),
      runs: research.runs,
    })
    await research.projectRepository.save(project())
  })

  it('hides the project from people outside its team', async () => {
    expect(
      await remove({ actor: { id: 'bob', role: 'member' }, projectId: 'p1', name: 'Été 2026' }),
    ).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' })
  })

  it('refuses a team member who is not its creator', async () => {
    expect(
      await remove({ actor: { id: 'alice', role: 'member' }, projectId: 'p1', name: 'Été 2026' }),
    ).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(research.projects.has('p1')).toBe(true)
  })

  it('refuses during a run, and with a wrong name', async () => {
    expect(await remove({ actor: carla, projectId: 'p1', name: 'wrong' })).toEqual({
      ok: false,
      error: 'NAME_MISMATCH',
    })
    research.runningProjects.add('p1')
    expect(await remove({ actor: carla, projectId: 'p1', name: 'Été 2026' })).toEqual({
      ok: false,
      error: 'SYNTHESIS_RUNNING',
    })
    expect(research.projects.has('p1')).toBe(true)
  })

  it('deletes with the right name, for the creator and for an admin', async () => {
    expect((await remove({ actor: carla, projectId: 'p1', name: ' Été 2026 ' })).ok).toBe(true)
    expect(research.projects.has('p1')).toBe(false)
    expect(await remove({ actor: carla, projectId: 'p1', name: 'Été 2026' })).toEqual({
      ok: false,
      error: 'PROJECT_NOT_FOUND',
    })
  })
})
