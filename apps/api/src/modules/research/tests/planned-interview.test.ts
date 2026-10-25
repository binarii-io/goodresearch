import { describe, expect, it } from 'vitest'
import { PlannedInterview, type PlannedInterviewFields } from '../domain/planned-interview.ts'

const t0 = new Date('2026-10-25T10:00:00Z')
const t1 = new Date('2026-10-25T11:00:00Z')
const fields = (overrides: Partial<PlannedInterviewFields> = {}): PlannedInterviewFields => ({
  interviewee: 'Sam Lee',
  role: 'Planner',
  interviewers: 'Alex',
  scheduledAt: new Date('2026-11-02T14:00:00Z'),
  status: 'scheduled',
  notes: '',
  ...overrides,
})
const create = (overrides: Partial<PlannedInterviewFields> = {}) =>
  PlannedInterview.create({ id: 'p1', studyId: 's1', by: 'a1', now: t0, ...fields(overrides) })

describe('PlannedInterview', () => {
  it('trims texts and starts at version 0', () => {
    const result = create({ interviewee: '  Sam  ', role: ' Planner ' })
    expect(result.ok && result.value.snapshot()).toMatchObject({
      interviewee: 'Sam',
      role: 'Planner',
      version: 0,
    })
  })

  it('enforces the limits of FR-011', () => {
    const invalid = { ok: false, error: 'VALIDATION' }
    expect(create({ interviewee: ' ' })).toEqual(invalid)
    expect(create({ interviewee: 'a'.repeat(121) })).toEqual(invalid)
    expect(create({ role: 'a'.repeat(121) })).toEqual(invalid)
    expect(create({ interviewers: 'a'.repeat(201) })).toEqual(invalid)
    expect(create({ notes: 'a'.repeat(2001) })).toEqual(invalid)
    expect(create({ status: 'lost' as never })).toEqual(invalid)
    expect(create({ scheduledAt: new Date('nope') })).toEqual(invalid)
    expect(create({ scheduledAt: null }).ok).toBe(true)
  })

  it('edits every field', () => {
    const created = create()
    if (!created.ok) throw new Error('fixture')
    const row = created.value
    expect(row.edit(fields({ status: 'done', notes: 'Went well' }), t1)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(row.snapshot()).toMatchObject({ status: 'done', notes: 'Went well', updatedAt: t1 })
    expect(row.edit(fields({ interviewee: '' }), t1)).toEqual({ ok: false, error: 'VALIDATION' })
  })
})
