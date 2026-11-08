/** One speaker turn of a session's transcript, made by the analysis (spec 038). */
export type Segment = {
  readonly speaker: string
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The segment holding a quote, word for word (accents, case and punctuation aside), or null: a
 * quote not found is never shown (FR-006). A quote may span two consecutive segments.
 */
export const segmentOfQuote = (segments: readonly Segment[], quote: string): Segment | null => {
  const q = plain(quote)
  if (q.length < 3) return null
  for (let i = 0; i < segments.length; i++) {
    const one = segments[i]
    if (!one) continue
    if (plain(one.text).includes(q)) return one
    const two = segments[i + 1]
    if (two && plain(`${one.text} ${two.text}`).includes(q)) return one
  }
  return null
}

/** Segments between two moments, for the prompts of a task (with a margin). */
export const segmentsBetween = (segments: readonly Segment[], startMs: number, endMs: number) =>
  segments.filter((s) => s.endMs >= startMs && s.startMs <= endMs)

/** Chunks transcripts read apart, joined in order; overlapping turns are kept once. */
export const joinChunks = (
  parts: readonly { segments: readonly Segment[]; keep: (ms: number) => boolean }[],
) =>
  parts
    .flatMap((p) => p.segments.filter((s) => p.keep(s.startMs)))
    .sort((a, b) => a.startMs - b.startMs)
