import { describe, expect, it } from 'vitest'
import type { ReportingSources, StudyCostRefs, StudyCounts } from '../application/ports.ts'
import { makeOverviewQueries } from '../application/queries/overview-queries.ts'

const counts: StudyCounts = {
  interviews: { validated: 21, proposed: 3, excluded: 2, participants: 22 },
  facts: [
    { status: 'accepted', count: 100 },
    { status: 'edited', count: 48 },
    { status: 'proposed', count: 464 },
    { status: 'rejected', count: 9 },
  ],
}
const refs: StudyCostRefs = {
  analysis: ['a'],
  lexicon: ['l'],
  cleaning: ['c'],
  quality: ['q'],
  facts: ['f'],
}
const forbidden = async () => {
  throw new Error('read')
}

const setup = (
  options: {
    studies?: { id: string; access: boolean }[] | null
    prices?: Record<string, number | null>
    over?: Partial<ReportingSources>
  } = {},
) => {
  const prices = options.prices ?? { a: 1, l: 0.5, c: 0.25, q: 0.25, f: 1 }
  const sources: ReportingSources = {
    studies: async () =>
      options.studies === undefined ? [{ id: 'st', access: true }] : options.studies,
    studyCounts: async () => counts,
    studyCostRefs: async (id) => (id === 'closed' ? { ...refs, facts: ['closed'] } : refs),
    insightCounts: async () => [],
    recommendationCounts: async () => [],
    takeaways: async () => null,
    projectCostRefs: async () => ({ insights: [], recommendations: [], takeaways: [] }),
    costs: async (asked) => new Map(asked.map((r) => [r, r in prices ? (prices[r] ?? null) : 0])),
    ...options.over,
  }
  return makeOverviewQueries({ sources })
}

const read = async (q: ReturnType<typeof setup>) => {
  const result = await q.get('alice', 'project')
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const readCosts = async (q: ReturnType<typeof setup>) => {
  const result = await q.costs('alice', 'project')
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('project overview (spec 017)', () => {
  it('counts what the modules report and points to the next step', async () => {
    const o = await read(setup())
    expect(o.steps[0]).toEqual({
      key: 'interviews',
      state: 'done',
      total: 24,
      validated: 21,
      toDecide: 3,
      participants: 22,
    })
    expect(o.steps[1]).toEqual({
      key: 'facts',
      state: 'to-decide',
      total: 612,
      validated: 148,
      toDecide: 464,
    })
    expect(o.nextStep).toBe('facts')
    expect(o.takeaways).toBeNull()
    expect(o.studies[0]?.counts).toEqual({
      validated: 21,
      toValidate: 3,
      excluded: 2,
      facts: 612,
      factsToDecide: 464,
    })
  })

  it('gives the cost per use of a study and the total of the project', async () => {
    const o = await readCosts(setup())
    expect(o.studies[0]?.cost).toEqual({
      total: 3,
      analysis: 1,
      lexicon: 0.5,
      cleaning: 0.25,
      quality: 0.25,
      facts: 1,
    })
    expect(o.cost).toEqual({ total: 3, studies: 3, insights: 0, recommendations: 0, takeaways: 0 })
  })

  it('shows a cost as unknown when a call has no price, never as a false amount', async () => {
    const o = await readCosts(setup({ prices: { a: 1, f: null } }))
    expect(o.studies[0]?.cost.facts).toBeNull()
    expect(o.studies[0]?.cost.total).toBeNull()
    expect(o.studies[0]?.cost.analysis).toBe(1)
    expect(o.cost.total).toBeNull()
    expect(o.cost.studies).toBeNull()
  })

  it('does not count a study without folder access, nor read its counts', async () => {
    const q = setup({
      studies: [
        { id: 'st', access: true },
        { id: 'closed', access: false },
      ],
      over: {
        studyCounts: async (id) => {
          if (id === 'closed') throw new Error('closed study counted')
          return counts
        },
      },
    })
    const o = await read(q)
    expect(o.hiddenStudies).toBe(1)
    expect(o.steps[0]).toMatchObject({ total: 24 })
    expect(o.studies[1]).toEqual({ id: 'closed', access: false, counts: null })
  })

  it('keeps a closed study in the total, without showing its own cost', async () => {
    const o = await readCosts(
      setup({
        studies: [
          { id: 'st', access: true },
          { id: 'closed', access: false },
        ],
        prices: { f: 1, closed: 2 },
      }),
    )
    expect(o.studies.map((s) => s.id)).toEqual(['st'])
    expect(o.cost.total).toBe(3)
  })

  it('starts empty without any study', async () => {
    const q = setup({ studies: [] })
    expect((await read(q)).nextStep).toBe('interviews')
    expect((await read(q)).studies).toEqual([])
    expect((await readCosts(q)).cost.total).toBe(0)
  })

  it('counts insights without the rejected ones, edited ones as validated', async () => {
    const o = await read(
      setup({
        over: {
          insightCounts: async () => [
            { status: 'validated', count: 1 },
            { status: 'edited', count: 1 },
            { status: 'proposed', count: 1 },
            { status: 'rejected', count: 1 },
          ],
        },
      }),
    )
    expect(o.steps[2]).toMatchObject({ total: 3, validated: 2, toDecide: 1, state: 'to-decide' })
  })

  it('marks the debrief done once key takeaways are written', async () => {
    const takeaways = { text: { en: 'Done', fr: '' }, translation: 'done' as const }
    const o = await read(setup({ over: { takeaways: async () => takeaways } }))
    expect(o.takeaways).toEqual(takeaways)
    expect(o.steps[4]).toMatchObject({ key: 'debrief', state: 'done' })
  })

  it('reads no cost for the counts', async () => {
    const o = await read(
      setup({ over: { studyCostRefs: forbidden, projectCostRefs: forbidden, costs: forbidden } }),
    )
    expect(o.steps).toHaveLength(5)
  })

  it('returns not found without access to the project', async () => {
    const q = setup({ studies: null })
    expect(await q.get('stranger', 'project')).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' })
    expect(await q.costs('stranger', 'project')).toEqual({ ok: false, error: 'PROJECT_NOT_FOUND' })
  })
})
