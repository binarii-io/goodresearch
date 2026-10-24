import { describe, expect, it } from 'vitest'
import { selectHistory } from '../domain/history.ts'
import { decideProposal } from '../domain/proposal.ts'
import { titleFrom } from '../domain/title.ts'

describe('conversation titles', () => {
  it('takes the first line of the first message, shortened on a word', () => {
    expect(titleFrom('Help me plan interviews\nwith new users')).toBe('Help me plan interviews')
    const long = 'word '.repeat(30)
    expect(titleFrom(long).length).toBeLessThanOrEqual(61)
    expect(titleFrom(long).endsWith('…')).toBe(true)
    expect(titleFrom('   ')).toBe('')
  })
})

describe('history budget (research R4)', () => {
  const msg = (i: number, size = 10) => ({ id: `m${i}`, text: 'x'.repeat(size) })

  it('keeps the most recent messages within the count and size budget, in order', () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg(i))
    const kept = selectHistory(messages, { maxMessages: 30, maxCharacters: 40_000 })
    expect(kept).toHaveLength(30)
    expect(kept[0]?.id).toBe('m20')
    expect(kept.at(-1)?.id).toBe('m49')
  })

  it('stops before the message that would exceed the size budget, keeping at least the last one', () => {
    const messages = [msg(1, 30_000), msg(2, 20_000), msg(3, 15_000)]
    expect(
      selectHistory(messages, { maxMessages: 30, maxCharacters: 40_000 }).map((m) => m.id),
    ).toEqual(['m2', 'm3'])
    expect(
      selectHistory([msg(1, 90_000)], { maxMessages: 30, maxCharacters: 40_000 }),
    ).toHaveLength(1)
  })
})

describe('proposal decisions (AI proposes, humans decide)', () => {
  it('decides a proposal once', () => {
    expect(decideProposal('proposed', 'applying')).toEqual({ ok: true, value: 'applying' })
    expect(decideProposal('proposed', 'dismissed')).toEqual({ ok: true, value: 'dismissed' })
    for (const done of ['applying', 'applied', 'dismissed', 'failed', 'invalid'] as const)
      expect(decideProposal(done, 'applying')).toEqual({ ok: false, error: 'PROPOSAL_DECIDED' })
  })
})
