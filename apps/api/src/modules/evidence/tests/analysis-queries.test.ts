import { fixedClock } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { makeAnalysisCommands } from '../application/commands/analysis-commands.ts'
import { makeAnalysisQueries } from '../application/queries/analysis-queries.ts'
import { fakeFactsAi, fakeSources, makeDeps } from './fakes/in-memory-evidence.ts'

const NOW = new Date('2026-10-28T10:00:00Z')
const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }
const turns = [
  { id: 'g1', speaker: 'Alex Martin', start: null, text: 'How do you find the data?' },
  { id: 'g2', speaker: 'Sam Example', start: null, text: 'I never find the data of my team.' },
]

const setup = async (anonymised: boolean) => {
  const interviews = [{ id: 's1', title: 'Interview 1', people: [sam, alex], turns }]
  const src = fakeSources({ interviews, anonymised })
  const made = makeDeps({ sources: src.sources, ai: fakeFactsAi().ai, clock: fixedClock(NOW) })
  const commands = makeAnalysisCommands(made.deps)
  const started = await commands.start('a1', 'st', { all: true, consent: true })
  if (!started.ok) throw new Error(started.error)
  await commands.runJob({ runId: started.value.runId, studyId: 'st', all: true })
  return { ...made, src, interviews, queries: makeAnalysisQueries(made.deps) }
}

describe('Analysis queries', () => {
  it('lists the interview with its state, counts and the cost of its readings (FR-001)', async () => {
    const s = await setup(false)
    const view = await s.queries.overview('a1', 'st')
    expect(view.ok && view.value.interviews).toEqual([
      expect.objectContaining({
        sessionId: 's1',
        state: 'to-decide',
        verbatims: 1,
        facts: { toDecide: 1, accepted: 0, rejected: 0 },
        cost: 0.02,
      }),
    ])
    expect(view.ok && view.value.run).toMatchObject({ total: 1, done: 1, finished: true })
  })

  it('shows the participant’s name, or their pseudonym when anonymised (FR-015)', async () => {
    const named = await setup(false)
    const one = await named.queries.interview('a1', 'st', 's1')
    expect(one.ok && one.value.verbatims.map((v) => v.participant)).toEqual(['Sam Example'])
    expect(one.ok && one.value.turns?.map((t) => t.role)).toEqual(['interviewer', 'interviewee'])
    const hidden = await setup(true)
    const two = await hidden.queries.interview('a1', 'st', 's1')
    expect(two.ok && two.value.verbatims.map((v) => v.participant)).toEqual(['P01'])
    const page = await hidden.queries.factsPage('a1', 'st', { page: 1 })
    expect(page.ok && page.value.facts.map((f) => f.participants)).toEqual([['P01']])
  })

  it('flags a verbatim whose text is gone and asks to analyse again (FR-011)', async () => {
    const s = await setup(false)
    const [fact] = [...s.memory.facts.values()]
    if (!fact) throw new Error('no fact')
    s.memory.facts.set(fact.id, { ...fact, status: 'accepted' })
    const g2 = s.interviews[0]?.turns?.[1]
    if (!g2) throw new Error('fixture')
    // A word corrected elsewhere in the turn changes nothing.
    Object.assign(g2, { text: 'Honestly, I never find the data of my team.' })
    let view = await s.queries.overview('a1', 'st')
    expect(view.ok && view.value.interviews[0]?.state).toBe('done')
    Object.assign(g2, { text: 'I find it.' })
    view = await s.queries.overview('a1', 'st')
    expect(view.ok && view.value.interviews[0]).toMatchObject({
      state: 'to-analyse-again',
      lost: 1,
    })
  })
})
