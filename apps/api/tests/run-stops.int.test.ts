import { newId } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FactsRun } from '../src/modules/evidence/domain/analysis-run.ts'
import { createEvidenceStore } from '../src/modules/evidence/infrastructure/evidence.drizzle-store.ts'
import { researchProjects, researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import type { LexiconRun } from '../src/modules/transcripts/domain/lexicon-run.ts'
import { createTranscriptsStore } from '../src/modules/transcripts/infrastructure/transcripts.drizzle-store.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

/**
 * Taking one interview out of a reading is checked in the write itself: once the worker saved the
 * interview as done, the take-out is refused, and the worker's saves never clear one accepted.
 */
describe('one interview taken out of a reading, on PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  let teamId: string
  const now = new Date('2026-10-29T10:00:00Z')

  const study = async () => {
    const projectId = newId()
    const studyId = newId()
    await database.db.insert(researchProjects).values({
      id: projectId,
      teamId,
      name: 'P',
      goal: '',
      createdAt: now,
      updatedAt: now,
    })
    await database.db.insert(researchStudies).values({
      id: studyId,
      teamId,
      name: 'S',
      type: 'interviews',
      createdAt: now,
      updatedAt: now,
    })
    return studyId
  }

  beforeAll(async () => {
    database = await createTestDatabase()
    const [id] = await insertTeams(database.db, ['Team'])
    teamId = id ?? ''
  })

  afterAll(async () => {
    await database?.close()
  })

  it('a facts reading: refused once the interview is saved done, kept through later saves', async () => {
    const store = createEvidenceStore(database.db)
    const run: FactsRun = {
      id: newId(),
      studyId: await study(),
      teamId,
      startedBy: 'p1',
      sessions: [
        { sessionId: 'a', state: 'facts', chunks: 1, chunksDone: 1 },
        { sessionId: 'b', state: 'waiting', chunks: 0, chunksDone: 0 },
      ],
      stopRequested: false,
      stoppedSessions: [],
      leftOut: { verbatims: 0, facts: 0 },
      failure: null,
      startedAt: now,
      heartbeatAt: now,
      finishedAt: null,
    }
    expect(await store.startRun(run)).toBe(true)
    await store.saveRun({
      ...run,
      sessions: [
        { sessionId: 'a', state: 'done', chunks: 1, chunksDone: 1 },
        { sessionId: 'b', state: 'waiting', chunks: 0, chunksDone: 0 },
      ],
    })
    expect(await store.requestSessionStop(run.id, 'a')).toBe(false)
    expect(await store.requestSessionStop(run.id, 'b')).toBe(true)
    expect(await store.requestSessionStop(run.id, 'b')).toBe(true)
    await store.saveRun(run)
    expect((await store.getRun(run.id))?.stoppedSessions).toEqual(['b'])
    await store.saveRun({ ...run, finishedAt: now })
    expect(await store.requestSessionStop(run.id, 'b')).toBe(false)
  })

  it('a lexicon reading: only while the interview waits or is imported', async () => {
    const store = createTranscriptsStore(database.db)
    const run: LexiconRun = {
      id: newId(),
      studyId: await study(),
      teamId,
      startedBy: 'p1',
      sessions: [
        { sessionId: 'a', state: 'done' },
        { sessionId: 'b', state: 'reading' },
      ],
      phase: 'import',
      stopRequested: false,
      stoppedSessions: [],
      leftOut: 0,
      batchesTotal: 0,
      batchesDone: 0,
      failure: null,
      startedAt: now,
      heartbeatAt: now,
      finishedAt: null,
    }
    expect(await store.createRun(run)).toBe(true)
    expect(await store.requestSessionStop(run.id, 'a')).toBe(false)
    expect(await store.requestSessionStop(run.id, 'b')).toBe(true)
    await store.saveRun(run)
    expect((await store.getRun(run.id))?.stoppedSessions).toEqual(['b'])
    await store.saveRun({ ...run, phase: 'ai' })
    expect(await store.requestSessionStop(run.id, 'b')).toBe(false)
    await store.batchProcessed(run.id, 3, now)
    expect((await store.getRun(run.id))?.batchesDone).toBe(3)
    await store.saveRun({ ...run, phase: 'finished', batchesDone: 3, finishedAt: now })
    // A late answer of a run already closed changes nothing.
    await store.batchProcessed(run.id, 4, now)
    expect((await store.getRun(run.id))?.batchesDone).toBe(3)
  })
})
