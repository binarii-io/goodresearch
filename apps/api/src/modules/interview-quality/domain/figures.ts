import type { Role } from '@goodresearch/shared'
import { addTimes, NO_ONE, type SpeakingTimes, speakingTimes } from './speaking-times.ts'

export type RemarkKind = 'leading-question' | 'reformulation-with-opinion' | 'opinion'
export type Stance = 'agree' | 'disagree'

export type Breakdown = {
  readonly agreed: number
  readonly noOpinion: number
  readonly disagreed: number
}

export type Figures = SpeakingTimes & {
  readonly sentences: number
  readonly questions: number
  readonly simpleReformulations: number
  readonly leading: {
    readonly questions: Breakdown
    readonly reformulations: Breakdown
    readonly opinions: Breakdown
  }
  readonly leftOut: number
  readonly turnsSkipped: number
}

const NONE: Breakdown = { agreed: 0, noOpinion: 0, disagreed: 0 }

/** A remark without an opinion counts until someone disagrees; a disagreed one no longer does. */
export const leadingTotal = (b: Breakdown): number => b.agreed + b.noOpinion

export const emptyFigures = (): Figures => ({
  words: NO_ONE,
  minutes: null,
  sentences: 0,
  questions: 0,
  simpleReformulations: 0,
  leading: { questions: NONE, reformulations: NONE, opinions: NONE },
  leftOut: 0,
  turnsSkipped: 0,
})

const breakdownOf = (stances: readonly (Stance | null)[]): Breakdown => ({
  agreed: stances.filter((s) => s === 'agree').length,
  noOpinion: stances.filter((s) => s === null).length,
  disagreed: stances.filter((s) => s === 'disagree').length,
})

const addBreakdown = (a: Breakdown, b: Breakdown): Breakdown => ({
  agreed: a.agreed + b.agreed,
  noOpinion: a.noOpinion + b.noOpinion,
  disagreed: a.disagreed + b.disagreed,
})

/** The figures of one interview or one person in it: all counted by the app (FR-006). */
export const figuresOf = (input: {
  readonly times: SpeakingTimes
  readonly counts: readonly { readonly sentences: number; readonly questions: number }[]
  readonly reformulations: readonly { readonly requalifiedRemarkId: string | null }[]
  readonly remarks: readonly { readonly kind: RemarkKind; readonly stance: Stance | null }[]
  readonly leftOut: number
  readonly turnsSkipped: number
}): Figures => {
  const stances = (kind: RemarkKind) =>
    input.remarks.filter((r) => r.kind === kind).map((r) => r.stance)
  return {
    ...input.times,
    sentences: input.counts.reduce((n, c) => n + c.sentences, 0),
    questions: input.counts.reduce((n, c) => n + c.questions, 0),
    simpleReformulations: input.reformulations.filter((r) => r.requalifiedRemarkId === null).length,
    leading: {
      questions: breakdownOf(stances('leading-question')),
      reformulations: breakdownOf(stances('reformulation-with-opinion')),
      opinions: breakdownOf(stances('opinion')),
    },
    leftOut: input.leftOut,
    turnsSkipped: input.turnsSkipped,
  }
}

const isEmpty = (f: Figures) => f.words === NO_ONE

/** Figures of a group: each word and sentence counts once, so rows add up to the total. */
export const addFigures = (a: Figures, b: Figures): Figures => ({
  ...(isEmpty(a) ? b : addTimes(a, b)),
  sentences: a.sentences + b.sentences,
  questions: a.questions + b.questions,
  simpleReformulations: a.simpleReformulations + b.simpleReformulations,
  leading: {
    questions: addBreakdown(a.leading.questions, b.leading.questions),
    reformulations: addBreakdown(a.leading.reformulations, b.leading.reformulations),
    opinions: addBreakdown(a.leading.opinions, b.leading.opinions),
  },
  leftOut: a.leftOut + b.leftOut,
  turnsSkipped: a.turnsSkipped + b.turnsSkipped,
})

/** The row of what no one can say who said: a generic label with several interviewers (R5). */
export const NOT_IDENTIFIED = 'not-identified'

export type PersonInterview = {
  readonly turns: readonly {
    readonly speaker: string | null
    readonly start: number | null
    readonly text: string
  }[]
  readonly roleOf: (label: string | null) => Role
  /** The interviewer's code for a label; null when not identified. */
  readonly personOf: (label: string | null) => string | null
  /** The interviewers on the interview's roster: a row even if they said nothing. */
  readonly roster: readonly string[]
  readonly counts: readonly {
    readonly speakerLabel: string
    readonly sentences: number
    readonly questions: number
  }[]
  readonly reformulations: readonly {
    readonly speakerLabel: string
    readonly requalifiedRemarkId: string | null
  }[]
  readonly remarks: readonly {
    readonly speakerLabel: string
    readonly kind: RemarkKind
    readonly stance: Stance | null
  }[]
}

/**
 * FR-009, US4: per person, what they said in each interview. The interview's other words stay in
 * the row, so their share reads against the whole interview and the interviewees' is unchanged;
 * what adds up over the rows is the interviewers' own words, their sentences and remarks.
 */
export const personFigures = (
  interviews: readonly PersonInterview[],
): Map<string, { interviews: number; figures: Figures }> => {
  const rows = new Map<string, { interviews: number; figures: Figures }>()
  for (const i of interviews) {
    const key = (label: string | null) => i.personOf(label) ?? NOT_IDENTIFIED
    const said = [
      ...i.turns.filter((t) => i.roleOf(t.speaker) === 'interviewer').map((t) => t.speaker),
      ...i.counts.map((c) => c.speakerLabel),
      ...i.reformulations.map((r) => r.speakerLabel),
      ...i.remarks.map((r) => r.speakerLabel),
    ]
    for (const person of new Set([...i.roster, ...said.map(key)])) {
      const mine = <T extends { readonly speakerLabel: string }>(list: readonly T[]) =>
        list.filter((item) => key(item.speakerLabel) === person)
      const times = speakingTimes(i.turns, (label) => {
        const role = i.roleOf(label)
        // Another interviewer's words are part of the interview, not of this person.
        return role === 'interviewer' && key(label) !== person ? 'unknown' : role
      })
      const figures = figuresOf({
        times,
        counts: mine(i.counts),
        reformulations: mine(i.reformulations),
        remarks: mine(i.remarks),
        leftOut: 0,
        turnsSkipped: 0,
      })
      const row = rows.get(person)
      rows.set(person, {
        interviews: (row?.interviews ?? 0) + 1,
        figures: addFigures(row?.figures ?? emptyFigures(), figures),
      })
    }
  }
  return rows
}
