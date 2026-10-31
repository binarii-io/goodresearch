import { describe, expect, it } from 'vitest'
import { createQualityAi, REVIEW_SYSTEM, renderReview } from '../infrastructure/prompts/review.ts'

describe('the review prompt', () => {
  it('sends only the app sentences of an interviewer, and the rest as plain turns', () => {
    const prompt = renderReview({
      goal: 'Goal',
      guide: ['A question'],
      turns: [
        { id: 't1', speaker: 'interviewer', text: 'x', context: true, sentences: [] },
        {
          id: 't2',
          speaker: 'interviewer',
          text: 'Full.',
          context: false,
          sentences: [{ id: 't2.1', text: 'One sentence here?' }],
        },
        { id: 't3', speaker: 'interviewee P01', text: 'Words.', context: false, sentences: [] },
      ],
    })
    expect(prompt).toContain('\n<review-turns>\n')
    expect(prompt).toContain('t1 (context) — interviewer: x')
    expect(prompt).toContain('  t2.1: One sentence here?')
    expect(prompt).toContain('t3 — interviewee P01: Words.')
    expect(prompt).not.toContain('Full.')
  })

  it('states that a simple reformulation is good practice and never flagged (FR-005)', () => {
    expect(REVIEW_SYSTEM).toContain('good interviewing practice and is never flagged')
    expect(REVIEW_SYSTEM).toContain('a question mark')
    expect(REVIEW_SYSTEM).toContain('When in doubt, flag nothing.')
    expect(REVIEW_SYSTEM).toContain('did not express anywhere before it')
  })

  it('has no example to copy, and no name', () => {
    expect(REVIEW_SYSTEM).not.toMatch(/for example|e\.g\.|such as/i)
    expect(REVIEW_SYSTEM).not.toMatch(/"[A-Z][a-z]+ [a-z]+.*\?"/)
  })

  it('goes through the gateway with its ledger task and ref', async () => {
    const calls: unknown[][] = []
    const ai = createQualityAi({
      gateway: () => ({
        providerOf: async () => 'anthropic',
        generateObject: (async (...args: unknown[]) => {
          calls.push(args)
          return { object: { sentences: [{ id: 't1.1', kind: 'question', flag: null }] } }
        }) as never,
      }),
      estimateCost: async () => 0,
      studyCosts: async () => new Map(),
    })
    const out = await ai.review('a1', 'quality:r:s', { goal: '', guide: [], turns: [] })
    expect(out).toEqual([{ id: 't1.1', kind: 'question', flag: undefined }])
    expect(calls[0]?.[1]).toBe('interview-review')
    expect(calls[0]?.[3]).toMatchObject({ ref: 'quality:r:s' })
  })
})
