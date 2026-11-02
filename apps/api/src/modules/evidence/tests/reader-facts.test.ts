import { describe, expect, it } from 'vitest'
import { maskReaderFact, readerFact, readerInterviewNumbers } from '../domain/reader-facts.ts'

const fact = {
  id: 'f1',
  sessionId: 's2',
  studyId: 'st',
  statement: { en: 'Sam Example waits', fr: 'Sam Example attend' },
  translation: 'done',
  polarity: 'neutral',
  theme: null,
  verbatimIds: ['v1', 'v2'],
  origin: 'ai',
  status: 'accepted',
  runId: null,
  decidedBy: 'someone',
  decidedAt: new Date('2026-01-01T00:00:00Z'),
  version: 3,
} as never

const verbatims = (...list: { id: string; text: string; setAside?: boolean }[]) =>
  new Map(list.map((v) => [v.id, { segmentId: 'seg', participant: 'P01', setAside: false, ...v }]))

const interviews = readerInterviewNumbers(['s1', 's2'])

describe('a fact as a reader outside the team gets it (spec 026)', () => {
  it('names the interview by its number, never a title or a person', () => {
    const shown = readerFact(fact, { interviews, anonymised: false, verbatims: verbatims() })
    expect(shown.interviewNumber).toBe(2)
    expect(shown.decidedBy).toBeNull()
  })

  it('hides verbatims and codes unless the study is anonymised (FR-017)', () => {
    const shown = readerFact(fact, {
      interviews,
      anonymised: false,
      verbatims: verbatims({ id: 'v1', text: 'I wait a lot' }),
    })
    expect(shown.verbatims).toEqual([])
    expect(shown.participants).toEqual([])
  })

  it('gives verbatims with pseudonyms on an anonymised study', () => {
    const shown = readerFact(fact, {
      interviews,
      anonymised: true,
      verbatims: verbatims({ id: 'v1', text: 'I wait a lot' }),
    })
    expect(shown.verbatims).toMatchObject([{ participant: 'P01' }])
    expect(shown.participants).toEqual(['P01'])
  })

  it('leaves out verbatims set aside', () => {
    const shown = readerFact(fact, {
      interviews,
      anonymised: true,
      verbatims: verbatims({ id: 'v2', text: 'set aside words here', setAside: true }),
    })
    expect(shown.verbatims).toEqual([])
  })

  it('leaves out verbatims still to attribute', () => {
    const shown = readerFact(fact, {
      interviews,
      anonymised: true,
      verbatims: new Map([
        ['v1', { id: 'v1', segmentId: 'seg', text: 'words', participant: null, setAside: false }],
      ]),
    })
    expect(shown.verbatims).toEqual([])
  })

  it('masks the known names in statements and verbatims', () => {
    const shown = maskReaderFact(
      readerFact(fact, {
        interviews,
        anonymised: true,
        verbatims: verbatims({ id: 'v1', text: 'Sam Example told me to wait' }),
      }),
      ['Sam Example'],
    )
    expect(JSON.stringify(shown)).not.toContain('Sam')
  })
})
