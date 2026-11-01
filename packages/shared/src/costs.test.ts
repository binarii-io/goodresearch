import { describe, expect, it } from 'vitest'
import { anyCostUnknown, sumCosts, sumKnownCosts } from './costs.ts'

describe('a sum of AI costs', () => {
  it('adds what is known, a ref without record counting nothing', () => {
    expect(sumCosts([1, undefined, 0.5])).toBe(1.5)
  })

  it('is unknown as soon as one call has no price', () => {
    expect(sumCosts([1, null, 0.5])).toBeNull()
  })

  it('can give the known part and say it is incomplete', () => {
    expect(sumKnownCosts([1, null, 0.5])).toBe(1.5)
    expect(anyCostUnknown([1, null])).toBe(true)
    expect(anyCostUnknown([1, undefined])).toBe(false)
  })
})
