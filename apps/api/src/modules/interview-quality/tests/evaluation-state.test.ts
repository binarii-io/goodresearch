import { describe, expect, it } from 'vitest'
import { evaluationState, reviewActionOf } from '../domain/evaluation-state.ts'
import { isMeasurable, speakersIdentified } from '../domain/speaking-times.ts'

const at = new Date('2026-10-01T00:00:00Z')
const later = new Date('2026-10-02T00:00:00Z')
const base = {
  hasTranscript: true,
  measurable: true,
  reviewing: false,
  text: { rawImportedAt: at },
  evaluation: { rawImportedAt: at, textAnalysed: 'with-corrections', anonymised: false },
  textAnalysed: 'with-corrections',
  anonymised: false,
  lost: 0,
} as const

describe('evaluationState', () => {
  it('is reviewed after a review', () => {
    expect(evaluationState(base)).toBe('reviewed')
  })
  it('has no transcript, and is not measurable, before anything else', () => {
    expect(evaluationState({ ...base, hasTranscript: false, text: null })).toBe('no-transcript')
    expect(evaluationState({ ...base, measurable: false })).toBe('not-measurable')
  })
  it('stays not measurable once a person reviewed it anyway', () => {
    expect(evaluationState({ ...base, measurable: false, reviewing: true })).toBe('reviewing')
  })
  it('is reviewing during a review, not reviewed without one', () => {
    expect(evaluationState({ ...base, reviewing: true })).toBe('reviewing')
    expect(evaluationState({ ...base, evaluation: null })).toBe('not-reviewed')
  })
  it('is to review again when a remark is lost, turns were imported or a setting changed', () => {
    expect(evaluationState({ ...base, lost: 1 })).toBe('to-review-again')
    expect(evaluationState({ ...base, text: { rawImportedAt: later } })).toBe('to-review-again')
    expect(evaluationState({ ...base, anonymised: true })).toBe('to-review-again')
    expect(evaluationState({ ...base, textAnalysed: 'clean-only' })).toBe('to-review-again')
  })
})

describe('speakers not identified (spec 016, feedback from real data)', () => {
  const words = (interviewers: number, interviewees: number, unknown: number) => ({
    interviewers,
    interviewees,
    unknown,
  })

  it('needs an interviewer word, and at most a small share of words of no one', () => {
    expect(speakersIdentified(words(30, 70, 0))).toBe(true)
    expect(speakersIdentified(words(30, 60, 10))).toBe(true)
    expect(speakersIdentified(words(30, 45, 25))).toBe(false)
    expect(speakersIdentified(words(0, 100, 0))).toBe(false)
  })

  it('is not measurable, so a false 0% is never a figure', () => {
    expect(isMeasurable(words(0, 100, 0))).toBe(false)
    expect(isMeasurable(words(30, 45, 25))).toBe(false)
    expect(isMeasurable(words(30, 70, 0))).toBe(true)
  })

  it('shows as its own state, even on an interview reviewed before', () => {
    const state = evaluationState({
      hasTranscript: true,
      measurable: false,
      speakersIdentified: false,
      reviewing: false,
      text: { rawImportedAt: new Date(0) },
      evaluation: null,
      textAnalysed: 'with-corrections',
      anonymised: false,
      lost: 0,
    })
    expect(state).toBe('speakers-not-identified')
  })

  it('tells a transcript not clean yet from no transcript', () => {
    const state = evaluationState({
      hasTranscript: true,
      measurable: false,
      speakersIdentified: false,
      reviewing: false,
      text: null,
      evaluation: null,
      textAnalysed: 'clean-only',
      anonymised: false,
      lost: 0,
    })
    expect(state).toBe('not-clean')
  })
})

describe('the action of an interview row (T034)', () => {
  it('offers what can be done on that interview alone', () => {
    expect(reviewActionOf('not-reviewed')).toBe('review')
    expect(reviewActionOf('reviewed')).toBe('review-again')
    expect(reviewActionOf('to-review-again')).toBe('review-again')
    expect(reviewActionOf('not-measurable')).toBe('review-anyway')
    for (const state of [
      'no-transcript',
      'not-clean',
      'reviewing',
      'speakers-not-identified',
    ] as const)
      expect(reviewActionOf(state)).toBeNull()
  })
})
