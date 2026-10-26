import { describe, expect, it } from 'vitest'
import { type AnswerTerm, checkAnswer } from '../domain/answer-check.ts'
import type { Candidate } from '../domain/candidates.ts'
import {
  BATCH_SIZE,
  EXCERPT_MAX,
  excerptAt,
  excerptParts,
  makeBatches,
} from '../domain/excerpts.ts'
import type { Segment } from '../domain/segments.ts'

const segment = (id: string, text: string): Segment => ({ id, speaker: 'Lee', start: null, text })

const candidate = (spelling: string, places: Candidate['places'], over: Partial<Candidate> = {}) =>
  ({
    spelling,
    folded: spelling.toLowerCase(),
    language: 'en',
    count: places.length,
    sessions: new Set(places.map((p) => p.sessionId)).size,
    reasons: ['uncommon'],
    closeTo: null,
    places,
    ...over,
  }) satisfies Candidate

describe('excerptAt', () => {
  it('keeps the words around, at most 200 characters, cut on words', () => {
    const text = `${'word '.repeat(60)}Goodresearch${' tail'.repeat(60)}`
    const start = text.indexOf('Goodresearch')
    const excerpt = excerptAt(text, start, start + 12)
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX)
    expect(excerpt).toContain('Goodresearch')
    expect(excerpt.startsWith('word')).toBe(true)
    expect(excerpt.endsWith('tail')).toBe(true)
  })
})

describe('excerptParts', () => {
  it('splits the excerpt around the match, spaces collapsed', () => {
    const text = 'we use\nGoodresearch   every day'
    const start = text.indexOf('Goodresearch')
    expect(excerptParts(text, start, start + 12)).toEqual({
      before: 'we use ',
      match: 'Goodresearch',
      after: ' every day',
    })
  })
})

describe('makeBatches', () => {
  const s1 = segment('s1', 'Sam Example said Goodresearch is great')
  const s2 = segment('s2', 'and Goodresearch again')
  const s3 = segment('s3', 'Goodresearch here too')
  const segments = new Map([s1, s2, s3].map((s) => [s.id, s]))

  it('gives at most 3 excerpts, from different interviews first, names as placeholders', () => {
    const [batch] = makeBatches({
      candidates: [
        candidate('Goodresearch', [
          { sessionId: 'a', segmentId: 's1', start: 17, end: 29 },
          { sessionId: 'a', segmentId: 's2', start: 4, end: 16 },
          { sessionId: 'b', segmentId: 's3', start: 0, end: 12 },
          { sessionId: 'c', segmentId: 's1', start: 17, end: 29 },
        ]),
      ],
      segments,
      knownNames: ['Sam Example'],
      acceptedForms: new Map(),
    })
    expect(batch?.candidates[0]?.excerpts).toEqual([
      '[Person 1] said Goodresearch is great',
      'Goodresearch here too',
      'and Goodresearch again',
    ])
  })

  it('cuts in batches of 30 and gives the close accepted forms', () => {
    const many = Array.from({ length: BATCH_SIZE + 1 }, (_, i) =>
      candidate(`w${i}`, [], i === 0 ? { closeTo: 't1' } : {}),
    )
    const batches = makeBatches({
      candidates: many,
      segments,
      knownNames: [],
      acceptedForms: new Map([['t1', 'Goodresearch']]),
    })
    expect(batches.map((b) => b.candidates.length)).toEqual([BATCH_SIZE, 1])
    expect(batches[0]?.knownForms).toEqual(['Goodresearch'])
    expect(batches[1]?.knownForms).toEqual([])
  })
})

describe('checkAnswer', () => {
  const batch = {
    candidates: [
      { spelling: 'Gooresearch', excerpts: ['we use Gooresearch daily'] },
      { spelling: 'NPS', excerpts: ['our NPS went up'] },
    ],
    knownForms: ['Goodresearch'],
  }
  const term = (over: Partial<AnswerTerm>): AnswerTerm => ({
    form: 'Goodresearch',
    kind: 'suspect',
    correction: 'Goodresearch',
    category: 'product',
    definition: 'The research app.',
    variants: ['gooresearch'],
    existingTerm: 'goodresearch',
    quote: 'we use Gooresearch daily',
    ...over,
  })

  it('keeps checked variants and quotes, with the candidates own spelling', () => {
    expect(checkAnswer(batch, [term({})])).toEqual([
      {
        form: 'Goodresearch',
        kind: 'suspect',
        correction: 'Goodresearch',
        category: 'product',
        definition: 'The research app.',
        variants: ['Gooresearch'],
        existingForm: 'Goodresearch',
        quote: 'we use Gooresearch daily',
      },
    ])
  })

  it('drops a quote not in the excerpts, and a term without a known variant', () => {
    expect(checkAnswer(batch, [term({ quote: 'invented sentence' })])).toEqual([])
    expect(checkAnswer(batch, [term({ variants: ['Unknown'] })])).toEqual([])
  })

  it('gives each candidate to one term only, ignores unknown existing terms and cuts lengths', () => {
    const out = checkAnswer(batch, [
      term({ existingTerm: 'Other' }),
      term({
        form: 'X'.repeat(100),
        kind: 'domain',
        variants: ['Gooresearch', 'NPS'],
        quote: 'our NPS went up',
        definition: 'd'.repeat(300),
      }),
    ])
    expect(out[0]?.existingForm).toBeNull()
    expect(out[1]?.variants).toEqual(['NPS'])
    expect(out[1]?.form).toHaveLength(80)
    expect(out[1]?.definition).toHaveLength(200)
    expect(out[1]?.correction).toBeNull()
  })
})
