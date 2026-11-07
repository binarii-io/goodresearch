import { describe, expect, it } from 'vitest'
import {
  countInterviews,
  type InterviewFacts,
  interviewsStep,
  selectInterviews,
} from '../domain/interview-filters.ts'

const interview = (over: Partial<InterviewFacts> & { id: string }): InterviewFacts => ({
  state: 'proposed',
  title: null,
  defaultTitle: over.id,
  transcript: {},
  media: [{}],
  analysis: { state: 'done', proposals: [] },
  ...over,
})
const pending = { state: 'done', proposals: [{ status: 'proposed' }, { status: 'accepted' }] }

const all = [
  interview({ id: 'ready' }),
  interview({ id: 'decide', analysis: pending }),
  interview({ id: 'bare', analysis: null, media: [] }),
  interview({ id: 'lone', transcript: null, analysis: null }),
  interview({ id: 'failed', analysis: { state: 'failed', proposals: [] } }),
  interview({ id: 'done', state: 'validated', analysis: pending }),
  interview({ id: 'out', state: 'excluded', media: [] }),
]
const ids = (filters: Parameters<typeof selectInterviews>[1]) =>
  selectInterviews(all, filters).items.map((i) => i.id)

describe('spec 025 — the states of interviews', () => {
  it('counts each state, an interview possibly in several', () => {
    expect(countInterviews(all)).toEqual({
      total: 7,
      open: 5,
      'to-decide': 1,
      'no-transcript': 1,
      'no-recording': 2,
      'not-analysed': 3,
      ready: 1,
      validated: 1,
      excluded: 1,
      'not-ready': 0,
      readyForAnalysis: 0,
      videoMinutes: 0,
    })
  })

  it.each([
    ['to-decide', ['decide']],
    ['no-transcript', ['lone']],
    ['no-recording', ['bare', 'out']],
    ['not-analysed', ['bare', 'lone', 'failed']],
    ['ready', ['ready']],
    ['validated', ['done']],
    ['excluded', ['out']],
  ] as const)('filters %s', (filter, expected) => {
    expect(ids({ filters: [filter] })).toEqual(expected)
  })

  it('combines filters, and gives everything without any', () => {
    expect(ids({ filters: ['not-analysed', 'no-recording'] })).toEqual(['bare'])
    expect(ids({})).toHaveLength(7)
    expect(ids({ filters: ['ready', 'excluded'] })).toEqual([])
  })

  it('finds a name without accents or capitals', () => {
    const named = [interview({ id: 'a', title: 'Entretien Hélène' }), interview({ id: 'b' })]
    expect(selectInterviews(named, { name: 'helene' }).items.map((i) => i.id)).toEqual(['a'])
  })

  it('finds a person on the roster or in a suggestion, not in a rejected one', () => {
    const people = (status: string) => ({
      state: 'done',
      proposals: [{ status, people: [{ name: 'Nadia' }] }],
    })
    const list = [
      interview({ id: 'roster', roster: [{ name: 'Nadia' }] }),
      interview({ id: 'suggested', analysis: people('proposed') }),
      interview({ id: 'rejected', analysis: people('rejected') }),
    ]
    expect(selectInterviews(list, { name: 'nadia' }).items.map((i) => i.id)).toEqual([
      'roster',
      'suggested',
    ])
  })

  it('gives one page, and says how many matched', () => {
    const many = Array.from({ length: 120 }, (_, n) => interview({ id: `i${n}` }))
    expect(selectInterviews(many, {})).toMatchObject({ matched: 120, page: 1, pages: 3 })
    expect(selectInterviews(many, {}).items).toHaveLength(50)
    expect(selectInterviews(many, { page: 3 }).items).toHaveLength(20)
  })

  it('says what comes next', () => {
    const step = (list: InterviewFacts[]) => interviewsStep(countInterviews(list))
    expect(step([])).toBe('none')
    expect(step(all)).toBe('analyse')
    expect(step([interview({ id: 'a', analysis: pending })])).toBe('decide')
    expect(step([interview({ id: 'a' })])).toBe('validate')
    expect(step([interview({ id: 'a', transcript: null })])).toBe('validate')
    expect(step([interview({ id: 'a', state: 'validated' })])).toBe('done')
  })
})
