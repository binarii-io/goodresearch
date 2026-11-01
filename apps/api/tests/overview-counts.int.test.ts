import { newId } from '@goodresearch/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEvidenceStore } from '../src/modules/evidence/infrastructure/evidence.drizzle-store.ts'
import { evidenceFacts } from '../src/modules/evidence/infrastructure/schema.ts'
import { createIngestionStore } from '../src/modules/ingestion/infrastructure/ingestion.drizzle-store.ts'
import {
  ingestionAnalysisRuns,
  ingestionSessions,
} from '../src/modules/ingestion/infrastructure/schema.ts'
import { researchProjects, researchStudies } from '../src/modules/research/infrastructure/schema.ts'
import {
  synthesisInsights,
  synthesisRecommendations,
} from '../src/modules/synthesis/infrastructure/schema.ts'
import { createSynthesisStore } from '../src/modules/synthesis/infrastructure/synthesis.drizzle-store.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

const sorted = <T extends { status: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.status.localeCompare(b.status))

/** Spec 017: the counts of the project's Overview, in SQL. */
describe('the Overview counts, on PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createTestDatabase>>
  const now = new Date('2026-10-31T10:00:00Z')
  const projectId = newId()
  const studyId = newId()
  const otherStudyId = newId()
  const roster = [{ id: 'r1', name: 'Sam', role: 'interviewee' as const, memberId: null }]
  const session = (id: string, study = studyId) => ({
    id,
    studyId: study,
    media: [],
    state: 'validated',
    roster,
    createdAt: now,
    updatedAt: now,
  })

  beforeAll(async () => {
    database = await createTestDatabase()
    const [teamId] = await insertTeams(database.db, ['Team'])
    await database.db.insert(researchProjects).values({
      id: projectId,
      teamId: teamId ?? '',
      name: 'P',
      goal: '',
      createdAt: now,
      updatedAt: now,
    })
    await database.db.insert(researchStudies).values(
      [studyId, otherStudyId].map((id) => ({
        id,
        projectId,
        name: 'S',
        type: 'interviews',
        createdAt: now,
        updatedAt: now,
      })),
    )
  })

  afterAll(async () => {
    await database?.close()
  })

  it('counts the facts of the given interviews, per status', async () => {
    const [s1, s2, s3] = [newId(), newId(), newId()]
    await database.db
      .insert(ingestionSessions)
      .values([session(s1), session(s2), session(s3, otherStudyId)])
    const fact = (sessionId: string, status: string, study = studyId) => ({
      id: newId(),
      sessionId,
      studyId: study,
      statementEn: 'x',
      statementFr: 'x',
      polarity: 'neutral',
      origin: 'ai',
      status,
      createdAt: now,
    })
    await database.db
      .insert(evidenceFacts)
      .values([
        fact(s1, 'accepted'),
        fact(s1, 'proposed'),
        fact(s1, 'proposed'),
        fact(s2, 'proposed'),
        fact(s3, 'proposed', otherStudyId),
      ])
    const store = createEvidenceStore(database.db)
    expect(sorted(await store.factCounts(studyId, [s1]))).toEqual([
      { status: 'accepted', count: 1 },
      { status: 'proposed', count: 2 },
    ])
    expect(await store.factCounts(studyId, [])).toEqual([])
  })

  it('counts the insights and recommendations of a project, per status', async () => {
    const insight = (status: string) => ({
      id: newId(),
      projectId,
      themeKey: 'other',
      statementEn: 'x',
      statementFr: 'x',
      descriptionEn: '',
      descriptionFr: '',
      counterEn: '',
      counterFr: '',
      minorityEn: '',
      minorityFr: '',
      origin: 'ai',
      status,
    })
    await database.db
      .insert(synthesisInsights)
      .values([insight('validated'), insight('validated'), insight('rejected')])
    await database.db.insert(synthesisRecommendations).values({
      id: newId(),
      projectId,
      actionEn: 'x',
      actionFr: 'x',
      rationaleEn: '',
      rationaleFr: '',
      measureEn: '',
      measureFr: '',
      kind: 'build',
      impact: 'high',
      effort: 'low',
      origin: 'ai',
      status: 'proposed',
    })
    const store = createSynthesisStore(database.db)
    expect(sorted(await store.insightCounts(projectId))).toEqual([
      { status: 'rejected', count: 1 },
      { status: 'validated', count: 2 },
    ])
    expect(await store.recommendationCounts(projectId)).toEqual([{ status: 'proposed', count: 1 }])
  })

  it("reads the state and roster of a study's sessions, nothing else", async () => {
    const study = newId()
    await database.db.insert(researchStudies).values({
      id: study,
      projectId,
      name: 'S',
      type: 'interviews',
      createdAt: now,
      updatedAt: now,
    })
    const id = newId()
    await database.db.insert(ingestionSessions).values(session(id, study))
    expect(await createIngestionStore(database.db).sessionRosters(study)).toEqual([
      { id, state: 'validated', roster },
    ])
    const store = createIngestionStore(database.db)
    expect(await store.sessionIds(study)).toEqual([id])
    await database.db.insert(ingestionAnalysisRuns).values({
      id: newId(),
      studyId: study,
      startedBy: 'p1',
      sessionIds: [id, 'deleted-since'],
      state: 'done',
      startedAt: now,
      heartbeatAt: now,
    })
    expect(await store.analysedSessionIds(study)).toEqual([id, 'deleted-since'])
    expect(await store.sessionSummaries(study)).toEqual([
      {
        id,
        state: 'validated',
        title: null,
        interviewDate: null,
        language: null,
        transcriptFileId: null,
      },
    ])
  })
})
