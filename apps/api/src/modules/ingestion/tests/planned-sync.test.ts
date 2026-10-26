import { describe, expect, it } from 'vitest'
import { scheduleChange, sessionFromPlanned } from '../domain/planned-sync.ts'
import type { Session } from '../domain/session.ts'

const NOW = new Date('2026-10-26T10:00:00Z')
let n = 0
const newId = () => `n${++n}`

const session = (over: Partial<Session> = {}): Session => ({
  id: 's',
  studyId: 'study',
  transcriptFileId: 't',
  media: [],
  mediaEdited: false,
  state: 'proposed',
  excludedReason: null,
  title: null,
  plannedInterviewId: 'p',
  linkedBy: 'person',
  roster: [],
  decidedBy: null,
  decidedAt: null,
  interviewDate: null,
  language: null,
  attachments: [],
  analysis: null,
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
  ...over,
})

const planned = {
  id: 'p',
  interviewee: 'Sam Example',
  interviewers: 'Lee Example',
  scheduledAt: '2026-10-20T14:30:00.000Z',
}

describe('the schedule follows the interview (spec 009 FR-022)', () => {
  it('sends the people and the date that differ, keeping the planned time', () => {
    const s = session({
      roster: [
        { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
        { id: 'b', name: 'Lee Example', role: 'interviewer', memberId: 'm1' },
        { id: 'c', name: 'Ana Sample', role: 'interviewer', memberId: null },
      ],
      interviewDate: '2026-10-21',
    })
    expect(scheduleChange(s, planned)).toEqual({
      interviewers: 'Lee Example, Ana Sample',
      scheduledAt: '2026-10-21T14:30:00.000Z',
    })
  })

  it('changes nothing when the interview says the same, or says nothing', () => {
    expect(scheduleChange(session(), planned)).toBeNull()
    expect(
      scheduleChange(
        session({
          roster: [
            { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
            { id: 'b', name: 'Lee Example', role: 'interviewer', memberId: null },
          ],
          interviewDate: '2026-10-20',
        }),
        planned,
      ),
    ).toBeNull()
  })

  it('dates a planned interview without time at midday', () => {
    expect(
      scheduleChange(session({ interviewDate: '2026-10-21' }), { ...planned, scheduledAt: null }),
    ).toEqual({ scheduledAt: '2026-10-21T12:00:00.000Z' })
  })
})

describe('the interview follows the schedule (spec 009 FR-022)', () => {
  it('takes the people and the date, keeping ids and member links of the same names', () => {
    const s = session({
      roster: [
        { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
        { id: 'b', name: 'Lee Example', role: 'interviewer', memberId: 'm1' },
      ],
      interviewDate: '2026-10-20',
    })
    const next = sessionFromPlanned(
      s,
      {
        ...planned,
        interviewee: 'Sam Example',
        interviewers: 'Lee Example & Ana Sample',
        scheduledAt: '2026-10-22T09:00:00Z',
      },
      newId,
      NOW,
    )
    expect(next?.roster).toEqual([
      { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
      { id: 'b', name: 'Lee Example', role: 'interviewer', memberId: 'm1' },
      expect.objectContaining({ name: 'Ana Sample', role: 'interviewer', memberId: null }),
    ])
    expect(next?.interviewDate).toBe('2026-10-22')
  })

  it('changes nothing when equal, and never a interview a person decided', () => {
    const s = session({
      roster: [
        { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
        { id: 'b', name: 'Lee Example', role: 'interviewer', memberId: null },
      ],
      interviewDate: '2026-10-20',
    })
    expect(sessionFromPlanned(s, planned, newId, NOW)).toBeNull()
    expect(
      sessionFromPlanned(
        { ...s, state: 'validated', decidedBy: 'someone' },
        { ...planned, interviewee: 'Other Person' },
        newId,
        NOW,
      ),
    ).toBeNull()
  })

  it('keeps several interviewees apart, both ways, so the two never loop', () => {
    const s = session({
      roster: [
        { id: 'a', name: 'Sam Example', role: 'interviewee', memberId: null },
        { id: 'c', name: 'Casey Test', role: 'interviewee', memberId: null },
      ],
      interviewDate: '2026-10-20',
    })
    const change = scheduleChange(s, planned)
    expect(change).toEqual({ interviewee: 'Sam Example, Casey Test' })
    const back = { ...planned, interviewee: change?.interviewee ?? '', interviewers: '' }
    expect(scheduleChange(s, back)).toBeNull()
    expect(sessionFromPlanned(s, back, newId, NOW)).toBeNull()
  })
})
