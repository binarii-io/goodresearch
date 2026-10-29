/** A turn of a transcript, as the chunks need it. */
export type ChunkSegment = {
  readonly id: string
  readonly speaker: string | null
  readonly text: string
}

/**
 * Spec 011 research R4 (also spec 012 R4): the AI reads a transcript 60 turns at a time, the 5
 * before as context.
 */
export const CHUNK_TURNS = 60
export const CHUNK_OVERLAP = 5
export const CHUNK_MAX_CHARS = 24_000
/** A longer turn is cut at sentence ends into parts of at most this. */
export const PART_MAX = 6_000

/** One turn (or part of a long turn) of a chunk, under a short id the AI answers with. */
export type ChunkTurn = {
  /** `t1`, `t2`… in the chunk. */
  readonly id: string
  readonly segmentId: string
  readonly speaker: string | null
  /** Where the part starts in the turn's text. */
  readonly offset: number
  readonly text: string
  /** Sent for context only: corrections on it are not kept. */
  readonly context: boolean
}

export type Chunk = { readonly turns: readonly ChunkTurn[] }

type Part = Omit<ChunkTurn, 'id' | 'context'>

const SENTENCE_END = /[.!?…]+["»”')\]]*\s+/g

/** A turn's text in parts of at most PART_MAX, cut after a sentence end (else at a space). */
const partsOf = (s: ChunkSegment): Part[] => {
  if (s.text.length <= PART_MAX)
    return [{ segmentId: s.id, speaker: s.speaker, offset: 0, text: s.text }]
  const out: Part[] = []
  let start = 0
  while (start < s.text.length) {
    let end = Math.min(start + PART_MAX, s.text.length)
    if (end < s.text.length) {
      const window = s.text.slice(start, end)
      let cut = -1
      for (const m of window.matchAll(SENTENCE_END)) cut = m.index + m[0].length
      if (cut <= 0) cut = window.lastIndexOf(' ') + 1
      if (cut > 0) end = start + cut
    }
    out.push({ segmentId: s.id, speaker: s.speaker, offset: start, text: s.text.slice(start, end) })
    start = end
  }
  return out
}

/**
 * The chunks the AI reads (research R4). Every wanted part is new in exactly one chunk; the 5
 * parts before a chunk, and the parts inside it not wanted, are context. Without `only`, every
 * turn is wanted.
 */
export const makeChunks = (
  segments: readonly ChunkSegment[],
  options: {
    readonly only?: ReadonlySet<string> | undefined
    readonly turns?: number
    readonly overlap?: number
    readonly maxChars?: number
  } = {},
): Chunk[] => {
  const size = options.turns ?? CHUNK_TURNS
  const overlap = options.overlap ?? CHUNK_OVERLAP
  const max = options.maxChars ?? CHUNK_MAX_CHARS
  const parts = segments.flatMap(partsOf)
  const wanted = (i: number) => {
    const p = parts[i]
    return p !== undefined && (!options.only || options.only.has(p.segmentId))
  }
  const chunks: Chunk[] = []
  let i = 0
  while (i < parts.length) {
    if (!wanted(i)) {
      i++
      continue
    }
    const first = i
    let chars = 0
    let newCount = 0
    let last = i
    // The window grows while the next wanted part is close and the chunk stays within its limits.
    for (let j = i; j < parts.length; j++) {
      if (!wanted(j)) {
        if (j - last > overlap) break
        continue
      }
      const contextChars = parts
        .slice(Math.max(0, first - overlap), first)
        .reduce((n, p) => n + p.text.length, 0)
      const between = parts.slice(last + 1, j).reduce((n, p) => n + p.text.length, 0)
      const length = parts[j]?.text.length ?? 0
      if (newCount > 0 && (newCount >= size || contextChars + chars + between + length > max)) break
      chars += between + length
      newCount++
      last = j
    }
    const before = parts.slice(Math.max(0, first - overlap), first)
    const inside = parts
      .slice(first, last + 1)
      .map((p, k) => ({ ...p, context: !wanted(first + k) }))
    const turns = [...before.map((p) => ({ ...p, context: true })), ...inside].map((p, k) => ({
      id: `t${k + 1}`,
      ...p,
    }))
    chunks.push({ turns })
    i = last + 1
  }
  return chunks
}
