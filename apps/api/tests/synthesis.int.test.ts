import { newId } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { researchProjects } from '../src/modules/research/infrastructure/schema.ts'
import type { InsightRun } from '../src/modules/synthesis/domain/insight-run.ts'
import type { Insight } from '../src/modules/synthesis/domain/insights.ts'
import { synthesisInsights } from '../src/modules/synthesis/infrastructure/schema.ts'
import { createSynthesisStore } from '../src/modules/synthesis/infrastructure/synthesis.drizzle-store.ts'
import { createTestDatabase } from './support/database.ts'
import { insertTeams } from './support/fixtures.ts'

/** Spec 013 store: one open run per project, a run's call in one transaction, cascade. */
describe('project insights, on PostgreSQL', () => {
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
  const run = (projectId: string): InsightRun => ({
    id: newId(),
    projectId,
    teamId,
    startedBy: 'p1',
    studyIds: ['st'],
    scope: 'all',
    withProposed: true,
    calls: 0,
    callsDone: 0,
    stopRequested: false,
    leftOut: 0,
    failure: null,
    startedAt: now,
    heartbeatAt: now,
    finishedAt: null,
  })
  const insight = (projectId: string, over: Partial<Insight> = {}): Insight => ({
    id: newId(),
    projectId,
    theme: { key: 'finding data', title: 'Finding data' },
    statement: { en: 'Teams rebuild reports', fr: 'Les équipes refont des rapports' },
    description: { en: 'd', fr: 'd' },
    counterEvidence: { en: 'None', fr: 'Aucun' },
    minorityView: { en: 'None', fr: 'Aucun' },
    translation: 'done',
    origin: 'ai',
    status: 'proposed',
    runId: null,
    decidedBy: null,
    decidedAt: null,
    version: 1,
    links: [
      {
        factId: newId(),
        role: 'support',
        state: 'counted',
        origin: 'ai',
        snapshot: { version: 2, polarity: 'negative', themeId: 'g1', statementEn: 'Cannot find' },
        by: 'ai',
        at: now,
      },
    ],
    pendingTranslation: { from: 'en', fields: ['statement'] },
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
    expect(await store.startRun(first)).toBe(true)
    expect(await store.startRun(run(projectId))).toBe(false)
    await store.requestStop(first.id)
    await store.saveRun({ ...first, callsDone: 1 })
    expect(await store.getRun(first.id)).toMatchObject({
      callsDone: 1,
      stopRequested: true,
      withProposed: true,
    })
    await store.saveRun({ ...first, finishedAt: now })
    expect(await store.startRun(run(projectId))).toBe(true)
  })

  it('saves an insight with its links and their fact snapshots, with a version check', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    const i = insight(projectId)
    expect(await store.saveInsight(i, null)).toBe('ok')
    expect(await store.getInsight(i.id)).toEqual(i)
    expect(await store.saveInsight({ ...i, version: 3 }, 2)).toBe('stale')
    const next = { ...i, status: 'validated' as const, version: 2, links: [] }
    expect(await store.saveInsight(next, 1)).toBe('ok')
    expect((await store.getInsight(i.id))?.links).toEqual([])
    // A decision never moves an insight: creation order, whatever was saved last.
    const later = insight(projectId)
    await store.saveInsight(later, null)
    await store.saveInsight({ ...next, status: 'rejected', version: 3 }, 2)
    expect((await store.insightsOf(projectId)).map((x) => x.id)).toEqual([i.id, later.id])
  })

  it('applies a call in one transaction, skipping an insight a person changed meanwhile', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    const decided = insight(projectId, { version: 4 })
    await store.saveInsight(decided, null)
    const created = insight(projectId)
    const { skipped } = await store.applyRun({
      creates: [created],
      updates: [{ insight: { ...decided, version: 4 }, expected: 3 }],
    })
    expect(skipped).toBe(1)
    expect((await store.insightsOf(projectId)).map((x) => x.id).sort()).toEqual(
      [created.id, decided.id].sort(),
    )
  })

  it('a deleted project takes its insights, links, runs and consents', async () => {
    const store = createSynthesisStore(database.db)
    const projectId = await project()
    await store.saveInsight(insight(projectId), null)
    await store.startRun(run(projectId))
    await store.giveConsent('p1', projectId, 'anthropic', now)
    expect(await store.hasConsent('p1', projectId, 'anthropic')).toBe(true)
    expect(await store.hasConsent('p1', projectId, 'openai')).toBe(false)
    await database.db.delete(researchProjects).where(eq(researchProjects.id, projectId))
    expect(await store.insightsOf(projectId)).toEqual([])
    expect(await store.openRun(projectId)).toBeNull()
    expect(await store.hasConsent('p1', projectId, 'anthropic')).toBe(false)
    expect(
      await database.db
        .select()
        .from(synthesisInsights)
        .where(eq(synthesisInsights.projectId, projectId)),
    ).toEqual([])
  })
})
