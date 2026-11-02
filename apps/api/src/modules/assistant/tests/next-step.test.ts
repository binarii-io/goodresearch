import { describe, expect, it } from 'vitest'
import { nextStep } from '../domain/next-step.ts'

const all = { hasGuide: true, hasFolder: true, published: ['guide', 'best-practices'] }

describe('spec 023 — the next step of a study', () => {
  it.each([
    ['no guide', { ...all, hasGuide: false, hasFolder: false, published: [] }, 'write-guide'],
    ['no folder', { ...all, hasFolder: false, published: [] }, 'add-folder'],
    ['nothing published', { ...all, published: [] }, 'publish'],
    ['only the guide published', { ...all, published: ['guide'] }, 'publish'],
    ['all done', all, 'fieldwork'],
  ])('with %s', (_case, state, step) => {
    expect(nextStep(state)).toBe(step)
  })
})
