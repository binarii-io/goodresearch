import { describe, expect, it } from 'vitest'
import {
  composeGoal,
  currentFraming,
  framingCompleteness,
  openPoints,
} from '../domain/project-framing.ts'

const allDone = {
  question: 'done',
  audience: 'done',
  decision: 'done',
  hypotheses: 'done',
  team: 'done',
}
const report = (at: string, states: Record<string, string>) => ({
  kind: 'report_project_progress' as const,
  state: 'applied' as const,
  decidedAt: new Date(at),
  preview: { progress: framingCompleteness(states) },
})
const created = (at: string, state: 'applied' | 'dismissed' = 'applied') => ({
  kind: 'create_project' as const,
  state,
  decidedAt: new Date(at),
  preview: {},
})

describe('spec 018 — project framing', () => {
  it('computes the percentage from the weights of the five points', () => {
    const all = framingCompleteness(allDone)
    expect(all.percent).toBe(100)
    expect(all.items.map((i) => [i.key, i.weight])).toEqual([
      ['question', 30],
      ['audience', 20],
      ['decision', 25],
      ['hypotheses', 15],
      ['team', 10],
    ])
    expect(framingCompleteness({ question: 'done', audience: 'partial' }).percent).toBe(40)
    expect(framingCompleteness({ question: 'nonsense' }).items[0]?.status).toBe('missing')
  })

  it('takes the latest report by time, whatever the order of the list', () => {
    const framing = currentFraming([
      report('2026-11-01T10:05:00Z', allDone),
      report('2026-11-01T10:00:00Z', { question: 'partial' }),
    ])
    expect(framing?.percent).toBe(100)
  })

  it('has no framing without a report, or after a project was applied', () => {
    expect(currentFraming([])).toBeNull()
    expect(
      currentFraming([report('2026-11-01T10:00:00Z', allDone), created('2026-11-01T10:01:00Z')]),
    ).toBeNull()
  })

  it('counts a report made after the card but before its Apply as finished with it', () => {
    const card = created('2026-11-01T10:10:00Z')
    expect(currentFraming([card, report('2026-11-01T10:05:00Z', allDone)])).toBeNull()
  })

  it('starts again with a report made after the Apply; a dismissed card ends nothing', () => {
    expect(
      currentFraming([
        created('2026-11-01T10:01:00Z'),
        report('2026-11-01T10:02:00Z', { question: 'done' }),
      ])?.percent,
    ).toBe(30)
    expect(
      currentFraming([
        report('2026-11-01T10:00:00Z', allDone),
        created('2026-11-01T10:01:00Z', 'dismissed'),
      ])?.percent,
    ).toBe(100)
  })

  it('names the points still open', () => {
    expect(openPoints(null)).toEqual(['question', 'audience', 'decision', 'hypotheses', 'team'])
    expect(openPoints(framingCompleteness({ ...allDone, team: 'partial' }))).toEqual(['team'])
    expect(openPoints(framingCompleteness(allDone))).toEqual([])
  })
})

describe('spec 018 — composed goal', () => {
  it('writes the three parts with headings in the language of the interface', () => {
    const parts = { question: 'Why?', objectives: 'Fix it', hypotheses: 'Too long' }
    expect(composeGoal(parts, 'en')).toBe(
      'Research question\nWhy?\n\nObjectives\nFix it\n\nHypotheses\nToo long',
    )
    expect(composeGoal(parts, 'fr')).toBe(
      'Question de recherche\nWhy?\n\nObjectifs\nFix it\n\nHypothèses\nToo long',
    )
  })

  it('says when there are no hypotheses yet', () => {
    const parts = { question: 'Q', objectives: 'O', hypotheses: '' }
    expect(composeGoal(parts, 'en')).toContain('Hypotheses\nNone yet')
    expect(composeGoal(parts, 'fr')).toContain('Hypothèses\nAucune pour l’instant')
  })
})
