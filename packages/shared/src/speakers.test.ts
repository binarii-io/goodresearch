import { describe, expect, it } from 'vitest'
import { conductRoles, interviewerCode, isGenericLabel, speakerRole } from './speakers.ts'

const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
const lee = { name: 'Lee Sample', role: 'interviewee' as const, code: 'P02' }
const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }

describe('speakerRole (research R8)', () => {
  it('matches a label to a person by name, part of the name, or label under anonymisation', () => {
    const people = [sam, lee, alex]
    expect(speakerRole('Sam Example', people, new Map())).toEqual({
      role: 'interviewee',
      participant: 'P01',
    })
    expect(speakerRole('sam', people, new Map())).toEqual({
      role: 'interviewee',
      participant: 'P01',
    })
    expect(speakerRole('P02', people, new Map())).toEqual({
      role: 'interviewee',
      participant: 'P02',
    })
    expect(speakerRole('Alex Martin', people, new Map())).toEqual({
      role: 'interviewer',
      participant: null,
    })
    expect(speakerRole('Intervieweur 1', people, new Map())).toEqual({
      role: 'interviewer',
      participant: null,
    })
  })

  it('gives an unknown label to the only interviewee, else leaves it to a person', () => {
    expect(speakerRole('Speaker 2', [sam, alex], new Map())).toEqual({
      role: 'interviewee',
      participant: 'P01',
    })
    expect(speakerRole('Speaker 2', [sam, lee, alex], new Map())).toEqual({
      role: 'unknown',
      participant: null,
    })
    expect(speakerRole('Speaker 2', [sam, lee, alex], new Map([['Speaker 2', 'P02']]))).toEqual({
      role: 'interviewee',
      participant: 'P02',
    })
    expect(
      speakerRole('Speaker 2', [sam, lee, alex], new Map([['Speaker 2', 'interviewer']])),
    ).toEqual({ role: 'interviewer', participant: null })
    expect(speakerRole(null, [sam, lee], new Map())).toEqual({
      role: 'unknown',
      participant: null,
    })
  })

  it('matches a label that adds words to the full name (a meeting tool adds the office)', () => {
    expect(speakerRole('Alex MARTIN -OFFICE NORTH-', [sam, alex], new Map())).toEqual({
      role: 'interviewer',
      participant: null,
    })
    expect(speakerRole('Sam Example -SITE V2-', [sam, alex], new Map())).toEqual({
      role: 'interviewee',
      participant: 'P01',
    })
  })

  it("never gives the only interviewee a label that looks like an interviewer's", () => {
    expect(speakerRole('Alex M.', [sam, alex], new Map())).toEqual({
      role: 'unknown',
      participant: null,
    })
  })

  it('reads a role written as the label: an interviewer, or no name at all', () => {
    expect(speakerRole('Interviewer', [alex, sam], new Map())).toEqual({
      role: 'interviewer',
      participant: null,
    })
    expect(speakerRole('Intervieweuse 2', [alex, sam], new Map()).role).toBe('interviewer')
    expect(isGenericLabel('Speaker 2')).toBe(true)
    expect(isGenericLabel('Interviewée')).toBe(true)
    expect(isGenericLabel('P01')).toBe(true)
    expect(isGenericLabel('Sam Example')).toBe(false)
  })
})

describe('interviewerCode (spec 016 research R5)', () => {
  const kim = { name: 'Kim Sample', role: 'interviewer' as const, code: 'I02' }

  it('gives the interviewer a label matches', () => {
    expect(interviewerCode('Alex Martin', [sam, alex, kim])).toBe('I01')
    expect(interviewerCode('kim', [sam, alex, kim])).toBe('I02')
    expect(interviewerCode('Interviewer 2', [sam, alex, kim])).toBe('I02')
  })

  it('gives generic labels to the only interviewer of the roster', () => {
    expect(interviewerCode('Moderator', [sam, alex])).toBe('I01')
    expect(interviewerCode(null, [sam, alex])).toBe('I01')
  })

  it('leaves a generic label unidentified with several interviewers, or none', () => {
    expect(interviewerCode('Moderator', [sam, alex, kim])).toBeNull()
    expect(interviewerCode('Moderator', [sam])).toBeNull()
  })
})

describe('conductRoles (spec 016: who conducted the interview)', () => {
  const sam = { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' }
  const alex = { name: 'Alex Martin', role: 'interviewer' as const, code: 'I01' }
  const lee = { name: 'Lee Example', role: 'interviewer' as const, code: 'I02' }
  const none = new Map<string, string>()
  const roles = (labels: (string | null)[], people: Parameters<typeof conductRoles>[1]) =>
    Object.fromEntries(
      [...conductRoles(labels, people, none)].map(([label, r]) => [label ?? 'null', r.role]),
    )

  it('reproduces the 0%: with one interviewee, speakerRole gives them any unknown label', () => {
    // An interviewer's label the roster does not spell the same way.
    expect(speakerRole('Robin', [sam, alex], none).role).toBe('interviewee')
    expect(speakerRole('A. Martin', [sam, alex], none).role).toBe('unknown')
    expect(speakerRole('Sam Example', [sam, alex], none).role).toBe('interviewee')
  })

  it('takes the only label left for the only interviewer of the roster', () => {
    for (const label of ['A. Martin', 'Robin'])
      expect(roles([label, 'Sam Example'], [sam, alex])).toEqual({
        [label]: 'interviewer',
        'Sam Example': 'interviewee',
      })
  })

  it('gives no one the labels left when it cannot say who they are', () => {
    expect(roles(['Someone', 'Sam Example'], [sam])).toEqual({
      Someone: 'unknown',
      'Sam Example': 'interviewee',
    })
    expect(roles(['One', 'Two', 'Sam Example'], [sam, alex])).toEqual({
      One: 'unknown',
      Two: 'unknown',
      'Sam Example': 'interviewee',
    })
    expect(roles(['One', 'Two'], [sam, alex])).toEqual({ One: 'unknown', Two: 'unknown' })
    expect(roles(['A. Martin', 'Sam Example', 'Alex Martin'], [sam, alex])['A. Martin']).toBe(
      'unknown',
    )
  })

  it('keeps a single label for the single interviewee, and what is recognised', () => {
    expect(roles(['Someone'], [sam])).toEqual({ Someone: 'interviewee' })
    expect(roles(['Alex Martin', 'Lee Example', 'Sam Example'], [sam, alex, lee])).toEqual({
      'Alex Martin': 'interviewer',
      'Lee Example': 'interviewer',
      'Sam Example': 'interviewee',
    })
    expect(roles(['Interviewer', 'Sam Example'], [sam])).toEqual({
      Interviewer: 'interviewer',
      'Sam Example': 'interviewee',
    })
  })

  it("lets a person's attribution win", () => {
    const attributed = new Map([['One', 'interviewer']])
    const found = conductRoles(['One', 'Sam Example'], [sam], attributed)
    expect(found.get('One')?.role).toBe('interviewer')
  })
})
