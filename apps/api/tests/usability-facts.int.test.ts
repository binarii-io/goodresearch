import { fixedClock } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type ObservationFactInput,
  observationFact,
} from '../src/modules/evidence/domain/usability-facts.ts'
import { createEvidenceStore } from '../src/modules/evidence/infrastructure/evidence.drizzle-store.ts'
import { createUsabilityFactStore } from '../src/modules/evidence/infrastructure/usability-facts.drizzle-store.ts'
import { ingestionSessions } from '../src/modules/ingestion/infrastructure/schema.ts'
import { researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

const now = fixedClock(new Date('2026-11-08T10:00:00Z')).now()
const input: ObservationFactInput = {
  accountId: 'alice',
  observationId: 'o1',
  studyId: 'st',
  sessionId: 's1',
  statement: 'The export button is hard to find',
  language: 'en',
  polarity: 'negative',
  theme: { id: 'task-1', title: 'Export the report' },
  quote: 'where is the export',
  momentMs: 83_400,
  screenshotKey: 'usability/st/s1/a/o1.jpg',
  participant: 'P01',
  origin: 'ai',
}

describe('spec 038 — usability facts on PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  beforeAll(async () => {
    database = await createTestDatabase()
    const [teamId] = await insertTeams(database.db, ['Team'])
    await database.db.insert(researchStudies).values({
      id: 'st',
      teamId: teamId ?? '',
      name: 'S',
      type: 'usability-test',
      createdAt: now,
      updatedAt: now,
    })
    await database.db.insert(ingestionSessions).values({
      id: 's1',
      studyId: 'st',
      transcriptFileId: null,
      videoFileId: 'v1',
      media: [],
      state: 'validated',
      roster: [],
      createdAt: now,
      updatedAt: now,
    })
  })
  afterAll(async () => {
    await database?.close()
  })

  it('keeps a fact per observation with its support, apart from interview facts, and deletes it', async () => {
    const store = createUsabilityFactStore(database.db)
    const made = observationFact(input, null, [], now, () => 'fact-u1')
    if (!made.ok) throw new Error('fixture')
    await store.put(made.value.fact, now)
    const again = observationFact(
      { ...input, origin: 'person' },
      made.value.fact,
      [],
      now,
      () => 'x',
    )
    if (!again.ok) throw new Error('fixture')
    await store.put(again.value.fact, now)
    expect(await store.byObservation('o1')).toMatchObject({
      id: 'fact-u1',
      status: 'edited',
      support: { momentMs: 83_400, participant: 'P01' },
      version: 2,
    })
    expect(await store.save({ ...again.value.fact, translation: 'done' }, 1)).toBe('conflict')
    expect(await store.save({ ...again.value.fact, translation: 'done' }, 2)).toBe('ok')
    expect((await store.ofStudies(['st'])).map((f) => f.id)).toEqual(['fact-u1'])
    // Interview reads never see it.
    expect(await createEvidenceStore(database.db).factsOfStudy('st')).toEqual([])
    await store.deleteByObservation('o1')
    expect(await store.byIds(['fact-u1'])).toEqual([])
  })
})
