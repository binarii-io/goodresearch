import { describe, expect, it } from 'vitest'
import { isGenericLabel, speakerRole } from '../domain/speakers.ts'

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
