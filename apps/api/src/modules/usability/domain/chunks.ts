/** A part of a session's video read by one call, in milliseconds from its start. */
export type Span = { readonly startMs: number; readonly endMs: number }

/** The trial's lengths (research R3): 18-minute chunks overlapping by one minute. */
export const CHUNK_MS = 18 * 60_000
export const OVERLAP_MS = 60_000

/** The chunks of a video of `totalMs`; each starts where the previous one's own part ends. */
export const chunksOf = (totalMs: number, chunkMs = CHUNK_MS, overlapMs = OVERLAP_MS): Span[] => {
  const spans: Span[] = []
  for (let start = 0; start < totalMs; start += chunkMs)
    spans.push({ startMs: start, endMs: Math.min(totalMs, start + chunkMs + overlapMs) })
  return spans
}

/**
 * Whether a moment found in chunk `i` belongs to it: overlaps are cut at their middle, so a moment
 * belongs to one chunk only and is never counted twice.
 */
export const ownedBy = (
  momentMs: number,
  i: number,
  spans: readonly Span[],
  overlapMs = OVERLAP_MS,
) => {
  const next = spans[i + 1]
  const self = spans[i]
  if (!self) return false
  const lo = i === 0 ? 0 : self.startMs + overlapMs / 2
  const hi = next ? next.startMs + overlapMs / 2 : Number.POSITIVE_INFINITY
  return momentMs >= lo && momentMs < hi
}
