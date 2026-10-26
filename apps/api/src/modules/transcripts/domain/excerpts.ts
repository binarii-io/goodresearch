import { withPlaceholders } from '@goodresearch/shared'
import type { Candidate, Place } from './candidates.ts'
import type { Segment } from './segments.ts'

/** Research R5: what one AI call receives. */
export const BATCH_SIZE = 30
export const EXCERPTS_PER_CANDIDATE = 3
export const EXCERPT_MAX = 200

export type BatchCandidate = {
  readonly spelling: string
  readonly excerpts: readonly string[]
}

export type Batch = {
  readonly candidates: readonly BatchCandidate[]
  /** Accepted forms close to the batch's candidates: the AI may attach variants to them. */
  readonly knownForms: readonly string[]
}

/** Places from different interviews first, then the others, in order. */
const spread = (places: readonly Place[]): Place[] => {
  const seen = new Set<string>()
  const first: Place[] = []
  const rest: Place[] = []
  for (const p of places) {
    if (seen.has(p.sessionId)) rest.push(p)
    else {
      seen.add(p.sessionId)
      first.push(p)
    }
  }
  return [...first, ...rest]
}

/** An excerpt split around what it shows: the words before, the match, the words after. */
export type ExcerptParts = {
  readonly before: string
  readonly match: string
  readonly after: string
}

/** The text around a place, at most EXCERPT_MAX characters, cut on word boundaries. */
export const excerptParts = (text: string, start: number, end: number): ExcerptParts => {
  const room = Math.max(0, EXCERPT_MAX - (end - start))
  let from = Math.max(0, start - Math.floor(room / 2))
  let to = Math.min(text.length, end + (room - (start - from)))
  from = Math.max(0, to - EXCERPT_MAX)
  if (from > 0) {
    const space = text.indexOf(' ', from)
    if (space !== -1 && space < start) from = space + 1
  }
  if (to < text.length) {
    const space = text.lastIndexOf(' ', to)
    if (space > end) to = space
  }
  const clean = (part: string) => part.replace(/\s+/g, ' ')
  return {
    before: clean(text.slice(from, start)).trimStart(),
    match: clean(text.slice(start, end)),
    after: clean(text.slice(end, to)).trimEnd(),
  }
}

/** The excerpt as one text (what the AI receives). */
export const excerptAt = (text: string, start: number, end: number): string => {
  const p = excerptParts(text, start, end)
  return `${p.before}${p.match}${p.after}`.trim()
}

/**
 * Research R5: the candidates in batches of 30, each with at most 3 excerpts of at most 200
 * characters, known names always replaced by placeholders (spec FR-006, anonymisation or not).
 */
export const makeBatches = (input: {
  readonly candidates: readonly Candidate[]
  readonly segments: ReadonlyMap<string, Segment>
  readonly knownNames: readonly string[]
  /** Accepted form of each known term id. */
  readonly acceptedForms: ReadonlyMap<string, string>
}): Batch[] => {
  const batches: Batch[] = []
  for (let i = 0; i < input.candidates.length; i += BATCH_SIZE) {
    const slice = input.candidates.slice(i, i + BATCH_SIZE)
    const candidates = slice.map((c) => {
      const excerpts: string[] = []
      for (const p of spread(c.places)) {
        if (excerpts.length >= EXCERPTS_PER_CANDIDATE) break
        const segment = input.segments.get(p.segmentId)
        if (!segment) continue
        const excerpt = withPlaceholders(
          excerptAt(segment.text, p.start, p.end),
          input.knownNames,
        ).text
        if (!excerpts.includes(excerpt)) excerpts.push(excerpt)
      }
      return { spelling: c.spelling, excerpts }
    })
    const knownForms = [
      ...new Set(
        slice.flatMap((c) => {
          const form = c.closeTo ? input.acceptedForms.get(c.closeTo) : undefined
          return form ? [form] : []
        }),
      ),
    ]
    batches.push({ candidates, knownForms })
  }
  return batches
}
