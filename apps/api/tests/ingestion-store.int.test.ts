import { newId } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { StudySource } from '../src/modules/ingestion/application/ports.ts'
import { createIngestionStore } from '../src/modules/ingestion/infrastructure/ingestion.drizzle-store.ts'
import { researchProjects, researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

const file = (name: string) => ({
  id: newId(),
  name,
  kind: 'media' as const,
  group: 'Root',
  mimeType: 'video/mp4',
  size: 1,
  modifiedAt: null,
  webViewLink: 'https://drive.google.com/x',
})

describe('ingestion store: run-scoped writes (PR #2 review B2/B3)', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let store: ReturnType<typeof createIngestionStore>
  let studyId: string
  const now = new Date('2026-10-24T10:00:00Z')

  const source = (folderId: string, folderName: string): StudySource => ({
    studyId,
    folderId,
    folderName,
    ownerName: null,
    webViewLink: `https://drive.google.com/drive/folders/${folderId}`,
    attachedBy: '',
    attachedAt: now,
    inventory: {
      status: 'never',
      startedAt: null,
      finishedAt: null,
      runBy: null,
      progress: null,
      failure: null,
      lastSuccessAt: null,
    },
  })

  beforeAll(async () => {
    database = await createTestDatabase()
    store = createIngestionStore(database.db)
    const [teamId] = await insertTeams(database.db, ['Team'])
    const projectId = newId()
    studyId = newId()
    await database.db.insert(researchProjects).values({
      id: projectId,
      teamId: teamId ?? '',
      name: 'P',
      goal: '',
      createdAt: now,
      updatedAt: now,
    })
    await database.db.insert(researchStudies).values({
      id: studyId,
      projectId,
      name: 'S',
      type: 'interviews',
      createdAt: now,
      updatedAt: now,
    })
  })

  afterAll(async () => {
    await database?.close()
  })

  it('an old run writes nothing once the folder was replaced', async () => {
    await store.attachSource(source('folder-x', 'X'))
    const oldRun = await store.startInventory(studyId, 'someone', now)
    if (!oldRun) throw new Error('fixture')
    await store.attachSource(source('folder-y', 'Y'))
    expect(
      await store.completeInventory(
        oldRun,
        [file('secret-x.mp4')],
        { name: 'X', ownerName: null },
        now,
      ),
    ).toBe(false)
    await store.updateProgress(oldRun, { folders: 9, files: 9 })
    await store.failInventory(oldRun, 'DRIVE_ERROR', now)
    expect(await store.listFiles(studyId, {})).toEqual([])
    expect(await store.getSource(studyId)).toMatchObject({
      folderName: 'Y',
      inventory: { status: 'never', progress: null },
    })
  })

  it('only one active run; a stale one can be replaced; the current run completes', async () => {
    const run = await store.startInventory(studyId, 'someone', now)
    expect(run).not.toBeNull()
    expect(
      await store.startInventory(studyId, 'someone', new Date(now.getTime() + 60_000)),
    ).toBeNull()
    const later = await store.startInventory(
      studyId,
      'someone',
      new Date(now.getTime() + 36 * 60_000),
    )
    if (!run || !later) throw new Error('fixture')
    expect(
      await store.completeInventory(run, [file('stale.mp4')], { name: 'Y', ownerName: null }, now),
    ).toBe(false)
    expect(
      await store.completeInventory(
        later,
        [file('fresh.mp4')],
        { name: 'Y', ownerName: null },
        now,
      ),
    ).toBe(true)
    await store.updateProgress(later, { folders: 1, files: 1 })
    expect((await store.listFiles(studyId, {})).map((f) => f.name)).toEqual(['fresh.mp4'])
    expect((await store.getSource(studyId))?.inventory).toMatchObject({
      status: 'done',
      progress: null,
    })
  })
})
