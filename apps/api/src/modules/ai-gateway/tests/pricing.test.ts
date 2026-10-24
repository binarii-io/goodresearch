import { describe, expect, it } from 'vitest'
import { makeUsageCosts } from '../application/queries/usage-costs.ts'
import { costOf, priceAt } from '../domain/pricing.ts'
import { DEFAULT_PRICES } from '../infrastructure/default-prices.ts'

describe('dated prices', () => {
  it('uses the price in force on the day of the call', () => {
    expect(
      priceAt(DEFAULT_PRICES, 'gemini-3.8-flash', new Date('2026-10-24'))?.inputPerMillion,
    ).toBe(0.75)
    expect(
      priceAt(DEFAULT_PRICES, 'gemini-3.8-flash', new Date('2027-02-01'))?.inputPerMillion,
    ).toBe(1.5)
    expect(priceAt(DEFAULT_PRICES, 'unknown-model', new Date())).toBeNull()
  })

  it('computes the cost of a call from its tokens', () => {
    const cost = costOf(DEFAULT_PRICES, {
      model: 'claude-sonnet-5-5',
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      createdAt: new Date('2026-10-24'),
    })
    expect(cost).toBeCloseTo(3)
  })

  it('has no cost when the model has no price or the tokens are unknown', () => {
    const base = { inputTokens: 10, outputTokens: 10, createdAt: new Date('2026-10-24') }
    expect(costOf(DEFAULT_PRICES, { ...base, model: 'custom' })).toBeNull()
    expect(costOf(DEFAULT_PRICES, { ...base, model: 'gpt-5.5', outputTokens: null })).toBeNull()
  })

  it('counts refused calls as free and stopped ones as unknown', async () => {
    const entry = (outcome: string, ref: string) => ({
      id: ref,
      accountId: 'ada',
      task: 't',
      provider: 'anthropic' as const,
      model: 'claude-sonnet-5-5',
      inputTokens: null,
      outputTokens: null,
      durationMs: 1,
      outcome: outcome as 'cancelled',
      ref,
      createdAt: new Date('2026-10-24'),
    })
    const costs = makeUsageCosts({
      config: { offered: [], models: {} as never, timeoutMs: 1, prices: DEFAULT_PRICES },
      store: {
        usageByRefs: async () => [entry('RATE_LIMITED', 'a'), entry('cancelled', 'b')],
      } as never,
    })
    const result = await costs('ada', ['a', 'b'])
    expect(result.get('a')).toBe(0)
    expect(result.get('b')).toBeNull()
  })
})
