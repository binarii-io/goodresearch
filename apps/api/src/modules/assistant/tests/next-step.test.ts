import { describe, expect, it } from 'vitest'
import { nextStep, plannedCount } from '../domain/next-step.ts'

const all = { hasGuide: true, hasFolder: true, published: ['guide', 'best-practices'], planned: 2 }

describe('spec 023 — the next step of a study', () => {
  it.each([
    ['no guide', { ...all, hasGuide: false, hasFolder: false, published: [] }, 'write-guide'],
    ['no folder', { ...all, hasFolder: false, published: [] }, 'add-folder'],
    ['nothing published', { ...all, published: [] }, 'publish'],
    ['only the guide published', { ...all, published: ['guide'] }, 'publish'],
    ['nothing planned', { ...all, planned: 0 }, 'plan-interviews'],
    ['all done', all, 'fieldwork'],
  ])('with %s', (_case, state, step) => {
    expect(nextStep(state)).toBe(step)
  })

  it('does not count cancelled interviews as planned', () => {
    expect(plannedCount({ cancelled: 3 })).toBe(0)
    expect(plannedCount({ cancelled: 3, done: 1, invited: 1 })).toBe(2)
  })
})
