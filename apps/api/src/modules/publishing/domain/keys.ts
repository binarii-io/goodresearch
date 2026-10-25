import { canonical } from './three-way.ts'

/**
 * A key for an item added in a file (no identity yet), from its content: the same added row or
 * question keeps its key when others are inserted around it, so a decision on it is remembered
 * (PR #7 review). Identical items get `-2`, `-3`… in order.
 */
export const contentKeys = (prefix: string) => {
  const seen = new Map<string, number>()
  return (value: unknown): string => {
    const text = canonical(value)
    let hash = 5381
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0
    const base = `${prefix}:${hash.toString(36)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }
}
