import { newId } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { researchProjects } from '../src/modules/research/infrastructure/schema.ts'
import type { PublishedDeck } from '../src/modules/synthesis/domain/debrief.ts'
import { createSynthesisStore } from '../src/modules/synthesis/infrastructure/synthesis.drizzle-store.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

const STUDY = newId()

/** Spec 015 store: the published deck, at the version seen. */
describe('the published deck, on PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let teamId: string
  const now = new Date('2026-10-29T10:00:00Z')

  const project = async () => {
    const id = newId()
    await database.db
      .insert(researchProjects)
      .values({ id, teamId, name: 'P', goal: '', createdAt: now, updatedAt: now })
    return id
  }
  const deck = (projectId: string, over: Partial<PublishedDeck> = {}): PublishedDeck => ({
    projectId,
    fileId: 'file-1',
    folderId: 'folder-1',
    studyId: STUDY,
    link: 'https://drive.example.test/file/file-1',
    language: 'fr',
    withProposed: true,
    fingerprint: 'abc',
    studyIds: [STUDY],
    revision: 'rev-3',
    publishedBy: 'p1',
    publishedAt: now,
    version: 1,
    ...over,
  })

  beforeAll(async () => {
    database = await createTestDatabase()
    const [id] = await insertTeams(database.db, ['Team'])
    teamId = id ?? ''
  })

  afterAll(async () => {
    await database?.close()
  })

  it('replaces the record on a new publication, and an update only at the version seen', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    expect(await store.savePublishedDeck(deck(projectId), null)).toBe('ok')
    expect(await store.getPublishedDeck(projectId)).toEqual(deck(projectId))
    expect(
      await store.savePublishedDeck(deck(projectId, { fingerprint: 'def', version: 2 }), 1),
    ).toBe('ok')
    expect(
      await store.savePublishedDeck(deck(projectId, { fingerprint: 'ghi', version: 2 }), 1),
    ).toBe('stale')
    expect(
      await store.savePublishedDeck(deck(projectId, { fileId: 'file-2', version: 3 }), null),
    ).toBe('ok')
    expect((await store.getPublishedDeck(projectId))?.fileId).toBe('file-2')
  })

  it('goes with the project', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    await store.savePublishedDeck(deck(projectId), null)
    await database.db.delete(researchProjects).where(eq(researchProjects.id, projectId))
    expect(await store.getPublishedDeck(projectId)).toBeNull()
  })
})
