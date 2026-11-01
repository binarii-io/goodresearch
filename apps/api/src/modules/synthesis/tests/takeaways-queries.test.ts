import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeTakeawaysQueries } from '../application/queries/takeaways-queries.ts'
import { fakeInsightsAi, fakeSources, makeDeps } from './fakes/in-memory-synthesis.ts'

const setup = () => {
  const src = fakeSources({
    studies: [{ id: 'st', name: 'S', access: true, type: 'interviews', hasFolder: true }],
    facts: [],
    access: (accountId) => accountId !== 'stranger',
  })
  const { deps } = makeDeps({
    sources: src.sources,
    ai: fakeInsightsAi().ai,
    clock: fixedClock(new Date('2026-10-31T10:00:00Z')),
  })
  return { queries: makeTakeawaysQueries(deps), src }
}

describe('the freshness of the key takeaways (spec 017)', () => {
  it('says nothing is out of date without takeaways, reading no fact', async () => {
    const s = setup()
    s.src.sources.facts = async () => {
      throw new Error('read')
    }
    expect(await s.queries.freshness('alice', 'project')).toEqual({
      ok: true,
      value: { outOfDate: false },
    })
  })

  it('returns not found without access to the project', async () => {
    expect(await setup().queries.freshness('stranger', 'project')).toEqual({
      ok: false,
      error: 'PROJECT_NOT_FOUND',
    })
  })
})
