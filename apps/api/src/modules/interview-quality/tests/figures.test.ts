import { describe, expect, it } from 'vitest'
import {
  addFigures,
  emptyFigures,
  figuresOf,
  leadingTotal,
  NOT_IDENTIFIED,
  personFigures,
} from '../domain/figures.ts'

const times = {
  words: { interviewers: 25, interviewees: 75, unknown: 0, otherInterviewers: 0 },
  minutes: null,
}
const remark = (kind: string, stance: 'agree' | 'disagree' | null = null) =>
  ({ kind, stance }) as Parameters<typeof figuresOf>[0]['remarks'][number]

describe('figuresOf (research R8)', () => {
  const figures = figuresOf({
    times,
    counts: [
      { sentences: 30, questions: 15 },
      { sentences: 10, questions: 5 },
    ],
    reformulations: [{ requalifiedRemarkId: null }, { requalifiedRemarkId: 'r1' }],
    remarks: [
      remark('leading-question'),
      remark('leading-question', 'agree'),
      remark('leading-question', 'disagree'),
      remark('reformulation-with-opinion'),
      remark('opinion', 'disagree'),
    ],
    leftOut: 2,
    turnsSkipped: 1,
  })

  it('sums the counts and leaves a requalified reformulation out of the simple ones', () => {
    expect(figures.sentences).toBe(40)
    expect(figures.questions).toBe(20)
    expect(figures.simpleReformulations).toBe(1)
    expect(figures.leftOut).toBe(2)
    expect(figures.turnsSkipped).toBe(1)
  })

  it('breaks each kind down by opinion', () => {
    expect(figures.leading.questions).toEqual({ agreed: 1, noOpinion: 1, disagreed: 1 })
    expect(figures.leading.reformulations).toEqual({ agreed: 0, noOpinion: 1, disagreed: 0 })
    expect(figures.leading.opinions).toEqual({ agreed: 0, noOpinion: 0, disagreed: 1 })
  })

  it('never counts what is disagreed with, and counts what nobody read', () => {
    expect(leadingTotal(figures.leading.questions)).toBe(2)
    expect(leadingTotal(figures.leading.opinions)).toBe(0)
  })

  it('adds figures up', () => {
    const sum = addFigures(figures, figures)
    expect(sum.sentences).toBe(80)
    expect(sum.leading.questions).toEqual({ agreed: 2, noOpinion: 2, disagreed: 2 })
    expect(sum.words.interviewers).toBe(50)
    expect(addFigures(emptyFigures(), figures)).toEqual(figures)
  })
})

describe('the rows of the By person view (US4)', () => {
  const roleOf = (label: string | null) =>
    label === 'Sam'
      ? ('interviewee' as const)
      : label
        ? ('interviewer' as const)
        : ('unknown' as const)
  const turn = (speaker: string, text: string) => ({ speaker, start: null, text })
  const shared = {
    sessionId: 's1',
    turns: [turn('Alex', 'one two three'), turn('Lee', 'four'), turn('Sam', 'five six')],
    roleOf,
    personOf: (label: string | null) => (label === 'Alex' ? 'I01' : label === 'Lee' ? 'I02' : null),
    roster: ['I01', 'I02'],
    counts: [
      { speakerLabel: 'Alex', sentences: 3, questions: 2 },
      { speakerLabel: 'Lee', sentences: 1, questions: 1 },
    ],
    reformulations: [{ speakerLabel: 'Lee', requalifiedRemarkId: null }],
    remarks: [{ speakerLabel: 'Alex', kind: 'opinion' as const, stance: null }],
  }
  const solo = {
    sessionId: 's2',
    turns: [turn('Interviewer', 'seven'), turn('Sam', 'eight')],
    roleOf,
    personOf: () => null,
    roster: [],
    counts: [{ speakerLabel: 'Interviewer', sentences: 2, questions: 1 }],
    reformulations: [],
    remarks: [
      { speakerLabel: 'Interviewer', kind: 'leading-question' as const, stance: 'agree' as const },
    ],
  }

  it('gives each person their own words and sentences, the interviewees staying whole', () => {
    const rows = personFigures([shared])
    expect(rows.get('I01')?.figures.words).toEqual({
      interviewers: 3,
      interviewees: 2,
      unknown: 0,
      otherInterviewers: 1,
    })
    expect(rows.get('I02')?.figures.words).toEqual({
      interviewers: 1,
      interviewees: 2,
      unknown: 0,
      otherInterviewers: 3,
    })
    expect(rows.get('I01')?.figures.sentences).toBe(3)
    expect(rows.get('I02')?.figures.simpleReformulations).toBe(1)
    expect(rows.get('I01')?.figures.leading.opinions.noOpinion).toBe(1)
  })

  it('puts what cannot be attributed in a row of its own, so that rows add up', () => {
    const rows = personFigures([shared, solo])
    const other = rows.get(NOT_IDENTIFIED)
    expect(other?.interviews).toBe(1)
    expect(other?.figures.leading.questions.agreed).toBe(1)
    const all = [...rows.values()].map((r) => r.figures)
    expect(all.reduce((n, f) => n + f.sentences, 0)).toBe(6)
    expect(all.reduce((n, f) => n + f.questions, 0)).toBe(4)
    expect(all.reduce((n, f) => n + f.words.interviewers, 0)).toBe(5)
  })

  it('has no row for not identified when everything is attributed', () => {
    expect(personFigures([shared]).has(NOT_IDENTIFIED)).toBe(false)
  })
})
