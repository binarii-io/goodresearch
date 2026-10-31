import { isTranscriptEnd, type Role, words } from '@goodresearch/shared'

/** Above this share of interviewer words, the labels are probably wrong (FR-002). */
const NOT_MEASURABLE_ABOVE = 0.95
/** Above this share of words of no one known, the speakers are not identified. */
const UNKNOWN_AT_MOST = 0.2

export type ByRole = {
  readonly interviewers: number
  readonly interviewees: number
  readonly unknown: number
  /** In a person's figures: the words of the interview's other interviewers. */
  readonly otherInterviewers: number
}

export type SpeakingTimes = {
  readonly words: ByRole
  /** Null unless every turn has a start (research R6). */
  readonly minutes: ByRole | null
}

type Turn = {
  readonly speaker: string | null
  readonly start: number | null
  readonly text: string
}

const KEY = {
  interviewer: 'interviewers',
  interviewee: 'interviewees',
  unknown: 'unknown',
  'other-interviewer': 'otherInterviewers',
} as const

export const NO_ONE: ByRole = { interviewers: 0, interviewees: 0, unknown: 0, otherInterviewers: 0 }

const add = (a: ByRole, b: ByRole): ByRole => ({
  interviewers: a.interviewers + b.interviewers,
  interviewees: a.interviewees + b.interviewees,
  unknown: a.unknown + b.unknown,
  otherInterviewers: a.otherInterviewers + b.otherInterviewers,
})

/** Words per role, and minutes from the gaps between turn starts (the last turn has none). */
export const speakingTimes = (
  all: readonly Turn[],
  roleOf: (speaker: string | null) => Role | 'other-interviewer',
): SpeakingTimes => {
  // A document's title or the note ending it: nobody speaks them.
  const turns = all.filter((t) => t.speaker !== null && !isTranscriptEnd(t.speaker))
  let count = NO_ONE
  let seconds = NO_ONE
  const timed = turns.length > 0 && turns.every((t) => t.start !== null)
  turns.forEach((turn, i) => {
    const key = KEY[roleOf(turn.speaker)]
    count = { ...count, [key]: count[key] + words(turn.text).length }
    const next = turns[i + 1]
    if (timed && next && next.start !== null && turn.start !== null)
      seconds = { ...seconds, [key]: seconds[key] + Math.max(0, next.start - turn.start) }
  })
  return {
    words: count,
    minutes: timed
      ? {
          interviewers: seconds.interviewers / 60,
          interviewees: seconds.interviewees / 60,
          unknown: seconds.unknown / 60,
          otherInterviewers: seconds.otherInterviewers / 60,
        }
      : null,
  }
}

/** Summed on the words themselves, never as an average of percentages (FR-002). */
export const addTimes = (a: SpeakingTimes, b: SpeakingTimes): SpeakingTimes => ({
  words: add(a.words, b.words),
  minutes: a.minutes && b.minutes ? add(a.minutes, b.minutes) : null,
})

/** The labels read as interviewers': a review reads only their sentences. */
export const interviewerLabels = (
  turns: readonly { readonly speaker: string | null }[],
  roleOf: (speaker: string | null) => Role,
): string[] =>
  [...new Set(turns.map((t) => t.speaker))]
    .filter((s): s is string => s !== null && roleOf(s) === 'interviewer')
    .sort()

/**
 * A real share of words spoken by no one known, or no interviewer word at all, makes the shares
 * false: 0% would say the interviewer was silent when their label was not recognised.
 */
export const speakersIdentified = (w: ByRole): boolean => {
  const total = w.interviewers + w.interviewees + w.unknown
  return w.interviewers > 0 && w.unknown / total <= UNKNOWN_AT_MOST
}

export const isMeasurable = (w: ByRole): boolean => {
  const total = w.interviewers + w.interviewees + w.unknown
  return total > 0 && speakersIdentified(w) && w.interviewers / total <= NOT_MEASURABLE_ABOVE
}
