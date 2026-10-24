import type { Price } from '../domain/pricing.ts'

/**
 * Dated price catalog of the default models (checked 2026-10-24 on the providers' announcements).
 * Costs are computed when read, with the price in force on the day of each call; deployers add or
 * replace prices with `AI_PRICES` (README, AI providers).
 */
export const DEFAULT_PRICES: readonly Price[] = [
  { model: 'claude-sonnet-5-5', from: '2026-01-01', inputPerMillion: 2, outputPerMillion: 10 },
  { model: 'gpt-5.5', from: '2026-01-01', inputPerMillion: 5, outputPerMillion: 30 },
  // Introductory rate until the end of 2026, then doubled.
  { model: 'gemini-3.8-flash', from: '2026-01-01', inputPerMillion: 0.75, outputPerMillion: 3.75 },
  { model: 'gemini-3.8-flash', from: '2027-01-01', inputPerMillion: 1.5, outputPerMillion: 7.5 },
]
