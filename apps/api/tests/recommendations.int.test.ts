import { newId } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { researchProjects } from '../src/modules/research/infrastructure/schema.ts'
import type { RecommendationRun } from '../src/modules/synthesis/domain/insight-run.ts'
import type { Recommendation } from '../src/modules/synthesis/domain/recommendations.ts'
import { createSynthesisStore } from '../src/modules/synthesis/infrastructure/synthesis.drizzle-store.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

/** Spec 014 store: one open run per project, versions, a call in one transaction, takeaways. */
describe('project recommendations and key takeaways, on PostgreSQL', () => {
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
  const run = (projectId: string): RecommendationRun => ({
    id: newId(),
    projectId,
    teamId,
    startedBy: 'p1',
    withProposed: true,
    calls: 1,
    callsDone: 0,
    stopRequested: false,
    leftOut: 0,
    failure: null,
    startedAt: now,
    heartbeatAt: now,
    finishedAt: null,
  })
  const rec = (projectId: string, over: Partial<Recommendation> = {}): Recommendation => ({
    id: newId(),
    projectId,
    action: { en: 'Add a catalogue', fr: 'Ajouter un catalogue' },
    rationale: { en: 'r', fr: 'r' },
    successMeasure: { en: 'm', fr: 'm' },
    kind: 'build',
    impact: 'high',
    effort: 'low',
    owner: 'Data team',
    translation: 'done',
    pendingTranslation: { from: 'en', fields: ['statement'] },
    origin: 'ai',
    status: 'proposed',
    runId: null,
    decidedBy: null,
    decidedAt: null,
    version: 1,
    links: [
      {
        insightId: newId(),
        state: 'counted',
        origin: 'ai',
        snapshot: { statementEn: 'Teams lose time', themeKey: 'finding data', level: 'high' },
        by: 'ai',
        at: now,
      },
    ],
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

  it('keeps one open run per project, and never clears a stop with a save', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    const first = run(projectId)
    expect(await store.startRecommendationRun(first)).toBe(true)
    expect(await store.startRecommendationRun(run(projectId))).toBe(false)
    await store.requestRecommendationStop(first.id)
    await store.saveRecommendationRun({ ...first, callsDone: 1 })
    expect(await store.getRecommendationRun(first.id)).toMatchObject({
      callsDone: 1,
      stopRequested: true,
      withProposed: true,
    })
  })

  it('saves recommendations with their links, in creation order, with a version check', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    const a = rec(projectId)
    const b = rec(projectId)
    await store.saveRecommendation(a, null)
    await store.saveRecommendation(b, null)
    expect(await store.getRecommendation(a.id)).toEqual(a)
    expect(await store.saveRecommendation({ ...a, version: 3 }, 2)).toBe('stale')
    await store.saveRecommendation({ ...a, status: 'rejected', version: 2 }, 1)
    expect((await store.recommendationsOf(projectId)).map((r) => r.id)).toEqual([a.id, b.id])
    const { skipped } = await store.applyRecommendations({
      creates: [rec(projectId)],
      updates: [{ recommendation: { ...b, version: 2 }, expected: 5 }],
    })
    expect(skipped).toBe(1)
    expect(await store.recommendationsOf(projectId)).toHaveLength(3)
  })

  it('saves the takeaways at the version seen, and the draft apart', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    await store.saveDraft(projectId, {
      text: { en: 'A. B.', fr: 'A. B.' },
      state: 'ready',
      by: 'p1',
      at: now,
      withProposed: true,
    })
    const blank = await store.getTakeaways(projectId)
    expect(blank).toMatchObject({ version: 0, draft: { state: 'ready' } })
    const saved = {
      ...(blank ??
        (() => {
          throw new Error('takeaways')
        })()),
      text: { en: 'A. B.', fr: 'A. B.' },
      savedBy: 'p1',
      savedAt: now,
      version: 1,
      savedOver: ['i1:2'],
      withProposed: true,
    }
    expect(await store.saveTakeaways(saved, 0)).toBe('ok')
    expect(await store.saveTakeaways({ ...saved, version: 2 }, 0)).toBe('stale')
    expect(await store.getTakeaways(projectId)).toMatchObject({
      version: 1,
      savedOver: ['i1:2'],
      withProposed: true,
      draft: { state: 'ready', text: { en: 'A. B.' }, withProposed: true },
    })
  })

  it('a deleted project takes its recommendations, runs and takeaways', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    await store.saveRecommendation(rec(projectId), null)
    await store.startRecommendationRun(run(projectId))
    await store.saveDraft(projectId, {
      text: null,
      state: 'drafting',
      by: 'p1',
      at: now,
      withProposed: false,
    })
    await database.db.delete(researchProjects).where(eq(researchProjects.id, projectId))
    expect(await store.recommendationsOf(projectId)).toEqual([])
    expect(await store.openRecommendationRun(projectId)).toBeNull()
    expect(await store.getTakeaways(projectId)).toBeNull()
  })
})
