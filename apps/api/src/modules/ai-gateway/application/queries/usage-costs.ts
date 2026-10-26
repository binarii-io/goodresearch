import { costOf, type Price, priceAt } from '../../domain/pricing.ts'
import type { AiDeps, UsageEntry } from '../ports.ts'

/** A dated catalog with other prices added, replacing those of the same model and date. */
export const priceCatalog = (base: readonly Price[], overrides: readonly Price[]): Price[] => [
  ...base.filter((p) => !overrides.some((o) => o.model === p.model && o.from === p.from)),
  ...overrides,
]

/** Characters per token, roughly, for estimates before a call (spec 009 research R5). */
const CHARS_PER_TOKEN = 4

const costsOf = (
  prices: readonly Price[],
  refs: readonly string[],
  entries: readonly UsageEntry[],
): Map<string, number | null> => {
  const costs = new Map<string, number | null>(refs.map((ref) => [ref, 0]))
  for (const entry of entries) {
    if (entry.ref === null) continue
    const sofar = costs.get(entry.ref)
    // A failed call without tokens produced nothing that can be billed or known (a failure after
    // the answer records its tokens). Only a stopped stream is billed with unknown tokens.
    const failed =
      entry.inputTokens === null &&
      entry.outputTokens === null &&
      entry.outcome !== 'success' &&
      entry.outcome !== 'cancelled'
    const cost = failed ? 0 : costOf(prices, entry)
    costs.set(
      entry.ref,
      sofar === null || sofar === undefined || cost === null ? null : sofar + cost,
    )
  }
  return costs
}

/**
 * Cost in USD of the calls made for each ref, computed now with the price in force on the day of
 * each call (constitution: costs at read time from a dated catalog). `null`: some call has no price
 * or its tokens are unknown (a stopped stream is billed by the provider, its tokens are not known).
 */
export const makeUsageCosts = (deps: Pick<AiDeps, 'store' | 'config'>) => {
  // The module passes the built-in catalog merged with the deployer's prices.
  const prices = deps.config.prices
  return async (accountId: string, refs: readonly string[]): Promise<Map<string, number | null>> =>
    costsOf(prices, refs, await deps.store.usageByRefs(accountId, refs))
}

/** The same, for every account: what a study's work cost, whoever did it (spec 009 FR-010). */
export const makeStudyCosts =
  (deps: Pick<AiDeps, 'store' | 'config'>) =>
  async (refs: readonly string[]): Promise<Map<string, number | null>> =>
    costsOf(deps.config.prices, refs, await deps.store.usageByRefsAll(refs))

/**
 * What a call would cost with the person's model today, from the characters sent and the tokens
 * expected back; null without a provider or a price.
 */
export const makeEstimateCost =
  (deps: Pick<AiDeps, 'store' | 'config' | 'clock'>) =>
  async (accountId: string, inputChars: number, outputTokens: number): Promise<number | null> => {
    const connection = await deps.store.getConnection(accountId)
    if (!connection || !deps.config.offered.includes(connection.provider)) return null
    const model = deps.config.models[connection.provider]
    const price = priceAt(deps.config.prices, model, deps.clock.now())
    if (!price) return null
    const input = Math.ceil(inputChars / CHARS_PER_TOKEN)
    return (input * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
  }
