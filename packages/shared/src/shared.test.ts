import { describe, expect, it } from 'vitest'
import { err, fixedClock, newId, ok } from './index.ts'

describe('Result', () => {
  it('wraps values and errors', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
    expect(err('NOPE')).toEqual({ ok: false, error: 'NOPE' })
  })
})

describe('newId', () => {
  it('generates sortable UUIDv7', () => {
    const a = newId<string>()
    const b = newId<string>()
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a[14]).toBe('7')
    expect(a < b).toBe(true)
  })
})

describe('fixedClock', () => {
  it('moves only when advanced', () => {
    const clock = fixedClock(new Date('2026-01-01T00:00:00Z'))
    clock.advance(1000)
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.000Z')
  })
})
