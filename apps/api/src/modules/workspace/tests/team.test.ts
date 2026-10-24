import { describe, expect, it } from 'vitest'
import { Team, teamNameKey } from '../domain/team.ts'

const now = new Date('2026-10-24T10:00:00Z')

describe('Team.create', () => {
  it('trims the name and derives its key', () => {
    const result = Team.create({ id: 't1', name: '  Growth Team ', now })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toBe('Growth Team')
    expect(result.value.nameKey).toBe('growth team')
    expect(result.value.version).toBe(0)
  })

  it('accepts 1 to 80 characters after trimming', () => {
    expect(Team.create({ id: 't1', name: 'a', now }).ok).toBe(true)
    expect(Team.create({ id: 't1', name: 'a'.repeat(80), now }).ok).toBe(true)
    expect(Team.create({ id: 't1', name: 'a'.repeat(81), now })).toEqual({
      ok: false,
      error: 'VALIDATION',
    })
    expect(Team.create({ id: 't1', name: '   ', now })).toEqual({ ok: false, error: 'VALIDATION' })
  })
})

describe('teamNameKey', () => {
  it('ignores case and surrounding spaces', () => {
    expect(teamNameKey(' Growth ')).toBe(teamNameKey('growth'))
  })
})
