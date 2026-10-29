import { describe, expect, it } from 'vitest'
import { translationAfter } from '../application/translation.ts'

describe('translationAfter (review of PR #14)', () => {
  const item = (
    translation: 'done' | 'translating' | 'not-translated',
    fields: string[] | null,
  ) => ({
    version: 1,
    translation,
    pendingTranslation: fields ? { from: 'en' as const, fields: fields as ['statement'] } : null,
  })

  it('ends a translation in flight only when every pending field is written in both languages', () => {
    expect(
      translationAfter(item('translating', ['action']), ['action'], null, null).translation,
    ).toBe('done')
    expect(
      translationAfter(item('translating', ['action', 'rationale']), ['action'], null, null)
        .translation,
    ).toBe('translating')
  })

  it('without knowing what is pending, keeps the state as it is', () => {
    expect(
      translationAfter(item('not-translated', null), ['rationale'], null, null).translation,
    ).toBe('not-translated')
  })
})
