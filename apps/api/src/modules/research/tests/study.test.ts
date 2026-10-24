import { describe, expect, it } from 'vitest'
import { Study } from '../domain/study.ts'

const t0 = new Date('2026-10-24T10:00:00Z')
const t1 = new Date('2026-10-24T11:00:00Z')
const create = (overrides: Partial<Parameters<typeof Study.create>[0]> = {}) =>
  Study.create({
    id: 's1',
    projectId: 'p1',
    name: 'Interviews Q4',
    type: 'interviews',
    createdBy: 'a1',
    now: t0,
    ...overrides,
  })

describe('Study', () => {
  it('trims the name and accepts 1 to 120 characters', () => {
    const study = create({ name: '  Interviews  ' })
    expect(study.ok && study.value.name).toBe('Interviews')
    expect(create({ name: 'a'.repeat(120) }).ok).toBe(true)
    expect(create({ name: 'a'.repeat(121) })).toEqual({ ok: false, error: 'VALIDATION' })
    expect(create({ name: ' ' })).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('only creates interview studies for now (FR-002)', () => {
    expect(create({ type: 'survey' })).toEqual({ ok: false, error: 'VALIDATION' })
    expect(create({ type: 'usability-test' })).toEqual({ ok: false, error: 'VALIDATION' })
    expect(create({ type: 'anything' })).toEqual({ ok: false, error: 'VALIDATION' })
  })

  it('renames and updates updatedAt', () => {
    const study = create()
    if (!study.ok) throw new Error('fixture')
    expect(study.value.rename('Renamed', t1)).toEqual({ ok: true, value: undefined })
    expect(study.value.snapshot()).toMatchObject({ name: 'Renamed', updatedAt: t1 })
    expect(study.value.rename('', t1)).toEqual({ ok: false, error: 'VALIDATION' })
  })
})
