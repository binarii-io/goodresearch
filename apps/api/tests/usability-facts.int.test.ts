import { fixedClock } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type ObservationFactInput,
  observationFact,
  taskFact,
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
  status: 'accepted',
  decidedBy: 'alice',
  decidedAt: new Date('2026-11-08T10:00:00Z'),
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
    const made = observationFact(input, null, [], () => 'fact-u1')
    if (!made.ok) throw new Error('fixture')
    await store.put(made.value.fact, now)
    const again = observationFact(
      { ...input, origin: 'person', status: 'edited' },
      made.value.fact,
      [],
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
    await store.deleteIds(['fact-u1'])
    expect(await store.byIds(['fact-u1'])).toEqual([])
  })

  it('keeps one task fact per study and task, with its counts, and no session (spec 039)', async () => {
    const store = createUsabilityFactStore(database.db)
    const fact = taskFact(
      {
        studyId: 'st',
        task: { id: 'task-1', index: 1, instruction: 'Export the report' },
        outcomes: { success: 2, partial: 0, failure: 1, notAttempted: 0 },
      },
      null,
      () => 'fact-t1',
    )
    if (!fact) throw new Error('fixture')
    await store.put(fact, now)
    expect(await store.tasksOf('st')).toMatchObject([
      {
        id: 'fact-t1',
        sessionId: null,
        status: 'proposed',
        support: { kind: 'task', taskId: 'task-1', sessions: 3, figuresChanged: false },
      },
    ])
    const changed = { ...fact, support: { ...fact.support, figuresChanged: true }, version: 2 }
    expect(await store.save(changed, 1)).toBe('ok')
    expect((await store.get('fact-t1'))?.support).toMatchObject({ figuresChanged: true })
    // A second fact for the same study and task is refused.
    await expect(store.put({ ...fact, id: 'fact-t2' }, now)).rejects.toThrow()
  })
})
