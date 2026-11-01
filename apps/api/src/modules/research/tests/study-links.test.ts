import { ConcurrencyError, fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { Study } from '../domain/study.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const t0 = new Date('2026-11-01T10:00:00Z')
const t1 = new Date('2026-11-01T11:00:00Z')
const study = () => {
  const created = Study.create({
    id: 's1',
    teamId: 'team-a',
    projectId: 'p1',
    goal: 'Why?',
    name: 'Interviews',
    type: 'interviews',
    createdBy: null,
    now: t0,
  })
  if (!created.ok) throw new Error('fixture')
  return created.value
}

describe('spec 019 — links of a study', () => {
  it('starts in its project and team, with the goal it was given', () => {
    expect(study().snapshot()).toMatchObject({
      teamId: 'team-a',
      projectIds: ['p1'],
      goal: 'Why?',
    })
  })

  it('attaches to a project of its team, after the others', () => {
    const s = study()
    expect(s.attach({ id: 'p2', teamId: 'team-a' }, t1)).toEqual({ ok: true, value: undefined })
    expect(s.projectIds).toEqual(['p1', 'p2'])
    expect(s.snapshot().updatedAt).toEqual(t1)
  })

  it('refuses a project of another team, and one already linked', () => {
    const s = study()
    expect(s.attach({ id: 'p2', teamId: 'team-b' }, t1)).toEqual({
      ok: false,
      error: 'DIFFERENT_TEAM',
    })
    expect(s.attach({ id: 'p1', teamId: 'team-a' }, t1)).toEqual({
      ok: false,
      error: 'ALREADY_LINKED',
    })
    expect(s.projectIds).toEqual(['p1'])
  })

  it('detaches down to no project, and refuses a project not linked', () => {
    const s = study()
    expect(s.detach('p2', t1)).toEqual({ ok: false, error: 'NOT_LINKED' })
    expect(s.detach('p1', t1)).toEqual({ ok: true, value: undefined })
    expect(s.projectIds).toEqual([])
  })

  it('takes an empty goal or one of at most 10,000 characters', () => {
    const s = study()
    expect(s.changeGoal('  ', t1).ok).toBe(true)
    expect(s.goal).toBe('')
    expect(s.changeGoal('x'.repeat(10_000), t1).ok).toBe(true)
    expect(s.changeGoal('x'.repeat(10_001), t1)).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('moves to another team with its project', () => {
    const s = study()
    s.moveToTeam('team-b', t1)
    expect(s.teamId).toBe('team-b')
  })
})

describe('spec 019 — attach and detach', () => {
  const alice = { id: 'alice', role: 'member' as const }
  const bob = { id: 'bob', role: 'member' as const }
  let research: InMemoryResearch
  let commands: ReturnType<typeof makeStudyCommands>
  let first: string
  let second: string
  let other: string
  let studyId: string

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a', 'team-b'],
      memberships: { alice: ['team-a', 'team-b'], bob: ['team-b'] },
      admins: [],
    })
    commands = makeStudyCommands({
      ...research.deps(fixedClock(t0)),
      studies: research.studyRepository,
      gate: research.gate,
      runs: research.runs,
    })
    first = await research.addProject('team-a')
    second = await research.addProject('team-a')
    other = await research.addProject('team-b')
    const created = await commands.createStudy({
      actor: alice,
      projectId: first,
      name: 'Interviews',
      type: 'interviews',
    })
    studyId = created.ok ? created.value.id : ''
  })

  it('takes the team and a copy of the goal of the project it is created in', async () => {
    const project = research.projects.get(first)
    project?.updateGoal('Why?', t1)
    const created = await commands.createStudy({
      actor: alice,
      projectId: first,
      name: 'Second',
      type: 'interviews',
    })
    expect(research.studies.get(created.ok ? created.value.id : '')?.snapshot()).toMatchObject({
      teamId: 'team-a',
      goal: 'Why?',
    })
  })

  it('attaches a study to a second project, and it stays in the first', async () => {
    expect(await commands.attachStudy({ actor: alice, projectId: second, studyId })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(research.studies.get(studyId)?.projectIds).toEqual([first, second])
  })

  it('refuses another team, a second attachment, and a closed folder or project', async () => {
    const attach = (projectId: string, actor = alice) =>
      commands.attachStudy({ actor, projectId, studyId })
    expect(await attach(other)).toEqual({ ok: false, error: 'DIFFERENT_TEAM' })
    expect(await attach(first)).toEqual({ ok: false, error: 'ALREADY_LINKED' })
    expect(await attach(second, bob)).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' })
    research.folderAccessDenied.add(`alice:${studyId}`)
    expect(await attach(second)).toEqual({ ok: false, error: 'FOLDER_ACCESS_REQUIRED' })
  })

  const racing = (first: Study | null) => {
    let stale = first
    return makeStudyCommands({
      ...research.deps(fixedClock(t0)),
      studies: {
        ...research.studyRepository,
        findById: async (id) => {
          const taken = stale
          stale = null
          return taken ?? research.studyRepository.findById(id)
        },
      },
      gate: research.gate,
      runs: research.runs,
    })
  }

  it('tells the second of two racing attachments that it is already there', async () => {
    const seen = await research.studyRepository.findById(studyId)
    const stale = await research.studyRepository.findById(studyId)
    await commands.attachStudy({ actor: alice, projectId: second, studyId })
    const late = makeStudyCommands({
      ...research.deps(fixedClock(t0)),
      studies: {
        ...research.studyRepository,
        findById: (() => {
          const reads = [seen, stale]
          return async (id: string) => reads.shift() ?? research.studyRepository.findById(id)
        })(),
      },
      gate: research.gate,
      runs: research.runs,
    })
    expect(await late.attachStudy({ actor: alice, projectId: second, studyId })).toEqual({
      ok: false,
      error: 'ALREADY_LINKED',
    })
  })

  it('goes through when someone changed something else of the study meanwhile', async () => {
    const third = await research.addProject('team-a')
    const seen = await research.studyRepository.findById(studyId)
    await commands.renameStudy({ actor: alice, studyId, name: 'Renamed', version: 0 })
    const late = racing(seen)
    expect((await late.attachStudy({ actor: alice, projectId: third, studyId })).ok).toBe(true)
    expect(research.studies.get(studyId)?.projectIds).toEqual([first, third])
    expect(research.studies.get(studyId)?.name).toBe('Renamed')
  })

  it('refuses to delete a study while a project it feeds is being read', async () => {
    await commands.attachStudy({ actor: alice, projectId: second, studyId })
    research.runningProjects.add(second)
    expect(await commands.deleteStudy({ actor: alice, studyId })).toEqual({
      ok: false,
      error: 'SYNTHESIS_RUNNING',
    })
  })

  it('reports a conflict when a study changes during a project move', async () => {
    const move = makeMoveProjectToTeam({
      ...research.deps(fixedClock(t1)),
      uow: (work) =>
        work({
          projects: research.projectRepository,
          studies: {
            ...research.studyRepository,
            save: async () => {
              throw new ConcurrencyError()
            },
          },
        }),
    })
    expect(await move({ actor: alice, projectId: first, teamId: 'team-b', version: 0 })).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('detaches down to no project; the study remains', async () => {
    expect(await commands.detachStudy({ actor: alice, projectId: first, studyId })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(research.studies.get(studyId)?.projectIds).toEqual([])
    expect(await commands.detachStudy({ actor: alice, projectId: first, studyId })).toEqual({
      ok: false,
      error: 'NOT_LINKED',
    })
  })

  it('refuses to detach while a run reads the project', async () => {
    research.runningProjects.add(first)
    expect(await commands.detachStudy({ actor: alice, projectId: first, studyId })).toEqual({
      ok: false,
      error: 'SYNTHESIS_RUNNING',
    })
    expect(research.studies.get(studyId)?.projectIds).toEqual([first])
  })

  it('keeps working on a study without a project, through its team', async () => {
    await commands.detachStudy({ actor: alice, projectId: first, studyId })
    expect(
      await commands.renameStudy({ actor: alice, studyId, name: 'Renamed', version: 1 }),
    ).toEqual({ ok: true, value: { version: 2 } })
    expect(await commands.renameStudy({ actor: bob, studyId, name: 'No', version: 2 })).toEqual({
      ok: false,
      error: 'STUDY_NOT_FOUND',
    })
    expect(
      await commands.updateStudyGoal({ actor: alice, studyId, goal: 'Own goal', version: 2 }),
    ).toEqual({ ok: true, value: { version: 3 } })
  })

  it('moves a project with its studies, unless one is shared', async () => {
    const move = makeMoveProjectToTeam(research.deps(fixedClock(t1)))
    await commands.attachStudy({ actor: alice, projectId: second, studyId })
    expect(await move({ actor: alice, projectId: first, teamId: 'team-b', version: 0 })).toEqual({
      ok: false,
      error: 'STUDY_SHARED',
    })
    await commands.detachStudy({ actor: alice, projectId: second, studyId })
    expect(
      await move({ actor: alice, projectId: first, teamId: 'team-b', version: 0 }),
    ).toMatchObject({ ok: true })
    expect(research.studies.get(studyId)?.teamId).toBe('team-b')
  })
})
