import { fixedClock } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { InMemoryResearch } from './fakes/in-memory-research.ts'

const admin = { id: 'admin', role: 'admin' as const }
const alice = { id: 'alice', role: 'member' as const }
const bob = { id: 'bob', role: 'member' as const }

describe('study commands', () => {
  let research: InMemoryResearch
  let commands: ReturnType<typeof makeStudyCommands>
  let projectId: string

  beforeEach(async () => {
    research = new InMemoryResearch({
      teams: ['team-a'],
      memberships: { alice: ['team-a'], bob: [] },
      admins: ['admin'],
    })
    const deps = research.deps(fixedClock(new Date('2026-10-24T10:00:00Z')))
    commands = makeStudyCommands({
      ...deps,
      studies: research.studyRepository,
      gate: research.gate,
    })
    projectId = await research.addProject('team-a')
  })

  it('creates an interview study in an accessible project', async () => {
    const result = await commands.createStudy({
      actor: alice,
      projectId,
      name: 'Interviews',
      type: 'interviews',
    })
    expect(result.ok).toBe(true)
    expect([...research.studies.values()].map((s) => s.name)).toEqual(['Interviews'])
  })

  it('hides projects outside the actor teams', async () => {
    expect(
      await commands.createStudy({ actor: bob, projectId, name: 'X', type: 'interviews' }),
    ).toEqual({
      ok: false,
      error: 'PROJECT_NOT_FOUND',
    })
  })

  it('refuses a stale rename', async () => {
    const created = await commands.createStudy({
      actor: alice,
      projectId,
      name: 'A',
      type: 'interviews',
    })
    if (!created.ok) throw new Error('fixture')
    const studyId = created.value.id
    await commands.renameStudy({ actor: alice, studyId, name: 'B', version: 0 })
    expect(await commands.renameStudy({ actor: alice, studyId, name: 'C', version: 0 })).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('needs folder access to rename or delete, except admins deleting (FR-010a, FR-010b)', async () => {
    const created = await commands.createStudy({
      actor: alice,
      projectId,
      name: 'A',
      type: 'interviews',
    })
    if (!created.ok) throw new Error('fixture')
    const studyId = created.value.id
    research.folderAccessDenied.add(`${alice.id}:${studyId}`)
    research.folderAccessDenied.add(`${admin.id}:${studyId}`)
    expect(await commands.renameStudy({ actor: alice, studyId, name: 'B', version: 0 })).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
    expect(await commands.deleteStudy({ actor: alice, studyId })).toEqual({
      ok: false,
      error: 'FOLDER_ACCESS_REQUIRED',
    })
    expect(await commands.deleteStudy({ actor: admin, studyId })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(research.studies.size).toBe(0)
  })
})
