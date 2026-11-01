/**
 * A sum of AI costs: null as soon as one has no known price, never a false amount. A ref nothing
 * was recorded for counts for nothing.
 */
export const sumCosts = (values: Iterable<number | null | undefined>): number | null => {
  let total = 0
  for (const v of values) {
    if (v === null) return null
    total += v ?? 0
  }
  return total
}

/** The known part of a sum, for a screen that also says it is incomplete. */
export const sumKnownCosts = (values: Iterable<number | null | undefined>): number => {
  let total = 0
  for (const v of values) total += v ?? 0
  return total
}

export const anyCostUnknown = (values: Iterable<number | null | undefined>): boolean => {
  for (const v of values) if (v === null) return true
  return false
}
