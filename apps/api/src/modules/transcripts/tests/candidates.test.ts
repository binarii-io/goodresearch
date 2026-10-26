import { describe, expect, it } from 'vitest'
import {
  CANDIDATE_LIMIT,
  type CommonWords,
  editDistance,
  findCandidates,
  type Interview,
  isClose,
  type KnownSpelling,
} from '../domain/candidates.ts'

const COMMON = new Set(
  'we use the and it is a to for our team every day on monday good research tool i love with this that drive of in told said lot ok well keep list do see'.split(
    ' ',
  ),
)
const common: CommonWords = (_language, word) => COMMON.has(word)

let n = 0
const interview = (sessionId: string, ...turns: [string, string][]): Interview => ({
  sessionId,
  language: 'en',
  segments: turns.map(([speaker, text]) => ({ id: `s${++n}`, speaker, start: null, text })),
})

const spellings = (input: Partial<Parameters<typeof findCandidates>[0]> = {}) =>
  findCandidates({ interviews: [], common, knownNames: [], lexicon: [], ...input }).candidates.map(
    (c) => c.spelling,
  )

describe('editDistance', () => {
  it('counts an adjacent transposition as one edit', () => {
    expect(editDistance('goodresearch', 'goodreserach', 2)).toBe(1)
    expect(editDistance('abc', 'abc', 1)).toBe(0)
    expect(editDistance('abc', 'xyz', 1)).toBe(2)
  })
  it('is close within 1 edit up to 6 letters and 2 above', () => {
    expect(isClose('gooresearch', 'goodresearch')).toBe(true)
    expect(isClose('good research', 'goodresearch')).toBe(true)
    expect(isClose('nps', 'ops')).toBe(true)
    expect(isClose('nps', 'opq')).toBe(false)
    expect(isClose('same', 'same')).toBe(false)
  })
})

describe('findCandidates', () => {
  it('finds uncommon words, acronyms and capitalised words inside a sentence', () => {
    const found = spellings({
      interviews: [
        interview(
          'a',
          ['Lee', 'We use Goodresearch every day.'],
          ['Sam', 'Our NPS is good and we use Kubernetes.'],
        ),
      ],
    })
    expect(found).toEqual(expect.arrayContaining(['Goodresearch', 'NPS', 'Kubernetes']))
    expect(found).not.toContain('We')
  })

  it('takes a run of capitalised words as one phrase', () => {
    expect(
      spellings({ interviews: [interview('a', ['Lee', 'we love Acme Cloud Suite a lot'])] }),
    ).toContain('Acme Cloud Suite')
  })

  it('never makes a phrase across punctuation nor with one-letter words', () => {
    const found = spellings({
      interviews: [
        interview('a', ['Lee', 'Well, I keep a list. Well, I do.']),
        interview('b', ['Lee', 'Well, I see.']),
      ],
    })
    expect(found).not.toContain('Well, I')
    expect(found).not.toContain('Well I')
  })

  it('keeps a capitalised common word only when several interviews write it so', () => {
    expect(spellings({ interviews: [interview('a', ['Lee', 'it is on Monday'])] })).not.toContain(
      'Monday',
    )
    expect(
      spellings({
        interviews: [
          interview('a', ['Lee', 'it is on Monday']),
          interview('b', ['Lee', 'on Monday']),
        ],
      }),
    ).toContain('Monday')
  })

  it('leaves out known names, speaker labels, placeholders, numbers and short words', () => {
    const found = spellings({
      knownNames: ['Camille Durand'],
      interviews: [
        interview(
          'a',
          ['Zorvath Kepler', 'I told Camille and Durand in 2026 ok'],
          ['Lee', '[Person 1] said xq Zorvath'],
        ),
      ],
    })
    expect(found).toEqual([])
  })

  it('never proposes a rejected or a known spelling, and marks close spellings', () => {
    const lexicon: KnownSpelling[] = [
      { termId: 't1', language: 'en', spelling: 'Goodresearch', state: 'active', accepted: true },
      { termId: 't2', language: 'en', spelling: 'Hmmm', state: 'rejected', accepted: false },
    ]
    const result = findCandidates({
      common,
      knownNames: [],
      lexicon,
      interviews: [interview('a', ['Lee', 'Goodresearch and Gooresearch, hmmm, good research'])],
    })
    const byName = new Map(result.candidates.map((c) => [c.spelling, c]))
    expect(byName.has('Goodresearch')).toBe(false)
    expect(byName.has('hmmm')).toBe(false)
    expect(byName.get('Gooresearch')?.closeTo).toBe('t1')
    expect(byName.get('good research')?.closeTo).toBe('t1')
  })

  it('ranks words found in several interviews first, and counts them', () => {
    const result = findCandidates({
      common,
      knownNames: [],
      lexicon: [],
      interviews: [
        interview('a', ['Lee', 'Zebulon Zebulon Zebulon Quaffle']),
        interview('b', ['Lee', 'Quaffle']),
      ],
    })
    expect(result.candidates.map((c) => [c.spelling, c.count, c.sessions])).toEqual([
      ['Quaffle', 2, 2],
      ['Zebulon', 3, 1],
    ])
  })

  it('keeps at most the limit and says how many were left out', () => {
    const many = Array.from({ length: CANDIDATE_LIMIT + 5 }, (_, i) => `zq${i.toString(36)}xw`)
    const result = findCandidates({
      common,
      knownNames: [],
      lexicon: [],
      interviews: [interview('a', ['Lee', many.join(' ')])],
    })
    expect(result.candidates).toHaveLength(CANDIDATE_LIMIT)
    expect(result.leftOut).toBe(5)
  })
})

describe('known names in every form (review of PR #10)', () => {
  it('never proposes a known name with a possessive or an elision', () => {
    const found = spellings({
      knownNames: ['Dana Sample', 'Amélie Durand'],
      interviews: [
        interview('a', ['Lee', "I asked about Dana's report and d'Amélie too, Zorblat"]),
      ],
    })
    expect(found).toContain('Zorblat')
    expect(found.filter((w) => /dana|amélie|amelie/i.test(w))).toEqual([])
  })
})
