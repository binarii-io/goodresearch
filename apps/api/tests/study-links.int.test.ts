import { fixedClock } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Study } from '../src/modules/research/domain/study.ts'
import {
  researchProjects,
  researchStudies,
  researchStudyProjects,
} from '../src/modules/research/infrastructure/schema.ts'
import { drizzleStudyRepository } from '../src/modules/research/infrastructure/study.drizzle-repository.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

const now = fixedClock(new Date('2026-11-01T10:00:00Z')).now()

describe('spec 019 — study links on PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let teamId = ''
  const project = async (id: string) =>
    database.db.insert(researchProjects).values({
      id,
      teamId,
      name: id,
      goal: '',
      createdAt: now,
      updatedAt: now,
    })
  const study = (id: string, projectId: string) => {
    const created = Study.create({
      id,
      teamId,
      projectId,
      goal: 'Why?',
      name: id,
      type: 'interviews',
      createdBy: null,
      now,
    })
    if (!created.ok) throw new Error('fixture')
    return created.value
  }

  beforeAll(async () => {
    database = await createTestDatabase()
    const [created] = await insertTeams(database.db, ['Team'])
    teamId = created ?? ''
  })
  afterAll(() => database.close())

  it('stores and reads the links in the order they were made', async () => {
    const repository = drizzleStudyRepository(database.db)
    await project('a')
    await project('b')
    await repository.save(study('s1', 'a'))
    const loaded = await repository.findById('s1')
    loaded?.attach({ id: 'b', teamId }, new Date(now.getTime() + 1000))
    if (loaded) await repository.save(loaded)
    expect((await repository.findById('s1'))?.projectIds).toEqual(['a', 'b'])
    expect((await repository.findByProject('b')).map((s) => s.id)).toEqual(['s1'])
  })

  it('detaches down to no project, keeping the study', async () => {
    const repository = drizzleStudyRepository(database.db)
    await project('c')
    await repository.save(study('s2', 'c'))
    const loaded = await repository.findById('s2')
    loaded?.detach('c', now)
    if (loaded) await repository.save(loaded)
    expect((await repository.findById('s2'))?.projectIds).toEqual([])
  })

  it('a deleted project takes its links, not its studies; a deleted study takes its links', async () => {
    const repository = drizzleStudyRepository(database.db)
    await project('d')
    await repository.save(study('s3', 'd'))
    await database.db.delete(researchProjects).where(eq(researchProjects.id, 'd'))
    expect((await repository.findById('s3'))?.projectIds).toEqual([])
    await project('e')
    await repository.save(study('s4', 'e'))
    await repository.delete('s4')
    expect(
      await database.db
        .select()
        .from(researchStudyProjects)
        .where(eq(researchStudyProjects.studyId, 's4')),
    ).toEqual([])
    expect(
      await database.db.select().from(researchStudies).where(eq(researchStudies.id, 's4')),
    ).toEqual([])
  })

  it('refuses to delete a team that still has a study', async () => {
    const { workspaceTeams } = await import('../src/modules/workspace/infrastructure/schema.ts')
    await expect(
      database.db.delete(workspaceTeams).where(eq(workspaceTeams.id, teamId)),
    ).rejects.toThrow()
  })
})
