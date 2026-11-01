import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeInsightQueries } from '../application/queries/insight-queries.ts'
import { makeRecommendationQueries } from '../application/queries/recommendation-queries.ts'
import { insightTranslationRef, recommendationTranslationRef } from '../domain/insight-run.ts'
import { fakeInsightsAi, fakeSources, makeDeps } from './fakes/in-memory-synthesis.ts'

const setup = (unpriced: string) => {
  const ai = fakeInsightsAi()
  ai.ai.costs = async (refs) => new Map(refs.map((r) => [r, r === unpriced ? null : 0.5]))
  const { deps } = makeDeps({
    sources: fakeSources({
      studies: [{ id: 'st', name: 'S', access: true, type: 'interviews', hasFolder: true }],
      facts: [],
    }).sources,
    ai: ai.ai,
    clock: fixedClock(new Date('2026-10-31T10:00:00Z')),
  })
  return deps
}

describe('a tab whose cost has a call without price', () => {
  it('Insights keep the known amount and say it is incomplete', async () => {
    const view = await makeInsightQueries(setup(insightTranslationRef('project'))).overview(
      'alice',
      'project',
    )
    if (!view.ok) throw new Error(view.error)
    expect(view.value).toMatchObject({ cost: 0, costIncomplete: true })
  })

  it('Recommendations keep the known amount and say it is incomplete', async () => {
    const view = await makeRecommendationQueries(
      setup(recommendationTranslationRef('project')),
    ).overview('alice', 'project')
    if (!view.ok) throw new Error(view.error)
    expect(view.value.costIncomplete).toBe(true)
    expect(view.value.cost).toBeGreaterThan(0)
  })
})
