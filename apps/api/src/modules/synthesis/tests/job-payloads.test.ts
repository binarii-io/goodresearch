import { describe, expect, it } from 'vitest'
import { TranslateJobPayload } from '../infrastructure/module.ts'

/** A translation job carries only the fields written (review of PR #14). */
describe('translation job payloads', () => {
  it('accepts the fields written, for an insight, a recommendation or the takeaways', () => {
    const job = { insightId: 'x', accountId: 'a', from: 'en' }
    expect(TranslateJobPayload.safeParse({ ...job, texts: { statement: 'Hi' } }).success).toBe(true)
    expect(
      TranslateJobPayload.safeParse({
        ...job,
        target: 'recommendation',
        texts: { action: 'Do it' },
      }).success,
    ).toBe(true)
    expect(
      TranslateJobPayload.safeParse({ ...job, target: 'takeaways', texts: { text: 'Two. Three.' } })
        .success,
    ).toBe(true)
    expect(TranslateJobPayload.safeParse({ ...job, texts: { other: 'x' } }).success).toBe(false)
  })
})
