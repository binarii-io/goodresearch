/** Price of one model from a date, in USD per million tokens (output includes reasoning tokens). */
export type Price = {
  readonly model: string
  readonly from: string
  readonly inputPerMillion: number
  readonly outputPerMillion: number
}

/** The price of `model` on `date` (the latest entry not after it), or null when unknown. */
export const priceAt = (prices: readonly Price[], model: string, date: Date): Price | null => {
  const day = date.toISOString().slice(0, 10)
  let found: Price | null = null
  for (const price of prices)
    if (price.model === model && price.from <= day && (!found || price.from > found.from))
      found = price
  return found
}

/** Cost of one call in USD, or null when its model has no price or its tokens are unknown. */
export const costOf = (
  prices: readonly Price[],
  call: { model: string; inputTokens: number | null; outputTokens: number | null; createdAt: Date },
): number | null => {
  const price = priceAt(prices, call.model, call.createdAt)
  if (!price || call.inputTokens === null || call.outputTokens === null) return null
  return (
    (call.inputTokens * price.inputPerMillion + call.outputTokens * price.outputPerMillion) /
    1_000_000
  )
}
