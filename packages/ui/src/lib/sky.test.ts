import { describe, expect, it } from 'vitest'
import { hashOf, sky } from './sky.ts'

describe('sky (generated project visual)', () => {
  it('is the same for the same id', () => {
    expect(sky('project-1')).toBe(sky('project-1'))
  })

  it('differs between ids', () => {
    expect(sky('project-1')).not.toBe(sky('project-2'))
  })

  it('keeps the glow inside the visual for every id', () => {
    for (let i = 0; i < 500; i++) {
      const [, y] = /ellipse at \d+% (-?\d+)%/.exec(sky(`id-${i}`)) ?? []
      expect(Number(y)).toBeGreaterThanOrEqual(30)
      expect(Number(y)).toBeLessThan(80)
    }
  })

  it('hashes to an unsigned 32-bit integer', () => {
    for (const id of ['', 'a', '0f0e4c4e-8a3b-4f3e-9a40-1c2a5e3b7d10']) {
      const h = hashOf(id)
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true)
    }
  })
})
