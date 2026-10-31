import { describe, expect, it } from 'vitest'
import { addTimes, isMeasurable, speakingTimes } from '../domain/speaking-times.ts'

const role = (speaker: string | null) =>
  speaker === 'A' ? 'interviewer' : speaker === 'B' ? 'interviewee' : 'unknown'
const turn = (speaker: string | null, words: number, start: number | null = null) => ({
  speaker,
  start,
  text: Array.from({ length: words }, () => 'word').join(' '),
})

describe('speakingTimes (research R6)', () => {
  it('counts the words per role', () => {
    const t = speakingTimes([turn('A', 25), turn('B', 75), turn('C', 10)], role)
    expect(t.words).toEqual({
      interviewers: 25,
      interviewees: 75,
      unknown: 10,
      otherInterviewers: 0,
    })
    expect(t.minutes).toBeNull()
  })

  it('counts no one for a document title or the note ending a transcript', () => {
    const t = speakingTimes(
      [
        turn(null, 30),
        turn('A', 5, 0),
        turn('B', 5, 60),
        turn('Transcription ended after', 20, 90),
      ],
      role,
    )
    expect(t.words).toEqual({ interviewers: 5, interviewees: 5, unknown: 0, otherInterviewers: 0 })
    expect(t.minutes).toEqual({
      interviewers: 1,
      interviewees: 0,
      unknown: 0,
      otherInterviewers: 0,
    })
  })

  it('gets the minutes from the gaps between turn starts, leaving out the last turn', () => {
    const t = speakingTimes([turn('A', 5, 0), turn('B', 5, 60), turn('A', 5, 240)], role)
    expect(t.minutes).toEqual({
      interviewers: 1,
      interviewees: 3,
      unknown: 0,
      otherInterviewers: 0,
    })
  })

  it('gives no minutes when one turn has no start', () => {
    expect(speakingTimes([turn('A', 5, 0), turn('B', 5, null)], role).minutes).toBeNull()
  })

  it('sums groups on the words, never as an average of percentages', () => {
    const a = speakingTimes([turn('A', 90), turn('B', 10)], role)
    const b = speakingTimes([turn('A', 10), turn('B', 890)], role)
    const sum = addTimes(a, b)
    expect(sum.words).toEqual({
      interviewers: 100,
      interviewees: 900,
      unknown: 0,
      otherInterviewers: 0,
    })
    expect(sum.minutes).toBeNull()
  })

  it('keeps minutes in a sum only when both sides have them', () => {
    const timed = speakingTimes([turn('A', 5, 0), turn('B', 5, 60)], role)
    expect(addTimes(timed, timed).minutes?.interviewers).toBe(2)
    expect(addTimes(timed, speakingTimes([turn('A', 5)], role)).minutes).toBeNull()
  })

  it('is not measurable above 95% of interviewer words, or without words', () => {
    expect(
      isMeasurable({ interviewers: 95, interviewees: 5, unknown: 0, otherInterviewers: 0 }),
    ).toBe(true)
    expect(
      isMeasurable({ interviewers: 96, interviewees: 4, unknown: 0, otherInterviewers: 0 }),
    ).toBe(false)
    expect(
      isMeasurable({ interviewers: 0, interviewees: 0, unknown: 0, otherInterviewers: 0 }),
    ).toBe(false)
  })
})
