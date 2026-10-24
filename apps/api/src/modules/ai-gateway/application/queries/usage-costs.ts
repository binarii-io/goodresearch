import { costOf, type Price } from '../../domain/pricing.ts'
import type { AiDeps } from '../ports.ts'

/** A dated catalog with other prices added, replacing those of the same model and date. */
export const priceCatalog = (base: readonly Price[], overrides: readonly Price[]): Price[] => [
  ...base.filter((p) => !overrides.some((o) => o.model === p.model && o.from === p.from)),
  ...overrides,
]

/** Failures that end a call before any token is processed: they cost nothing. */
const BEFORE_ANY_TOKEN: ReadonlySet<string> = new Set([
  'INVALID_CREDENTIAL',
  'PERMISSION_DENIED',
  'NO_CREDIT_OR_QUOTA',
  'RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'API_DISABLED',
  'PROJECT_NOT_FOUND',
])

/**
 * Cost in USD of the calls made for each ref, computed now with the price in force on the day of
 * each call (constitution: costs at read time from a dated catalog). `null`: some call has no price
 * or its tokens are unknown (a stopped stream is billed by the provider, its tokens are not known).
 */
export const makeUsageCosts = (deps: Pick<AiDeps, 'store' | 'config'>) => {
  // The module passes the built-in catalog merged with the deployer's prices.
  const prices = deps.config.prices
  return async (
    accountId: string,
    refs: readonly string[],
  ): Promise<Map<string, number | null>> => {
    const costs = new Map<string, number | null>(refs.map((ref) => [ref, 0]))
    for (const entry of await deps.store.usageByRefs(accountId, refs)) {
      if (entry.ref === null) continue
      const sofar = costs.get(entry.ref)
      const refused =
        entry.inputTokens === null &&
        entry.outputTokens === null &&
        BEFORE_ANY_TOKEN.has(entry.outcome)
      const cost = refused ? 0 : costOf(prices, entry)
      costs.set(
        entry.ref,
        sofar === null || sofar === undefined || cost === null ? null : sofar + cost,
      )
    }
    return costs
  }
}
