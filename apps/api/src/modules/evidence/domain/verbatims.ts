import { normaliseQuote, withPlaceholders, words } from '@goodresearch/shared'

/** FR-005: a verbatim says one idea in the interviewee's own words. */
export const VERBATIM_MIN_WORDS = 3
export const VERBATIM_MAX_WORDS = 120
/** Longest text the AI may quote for one verbatim (characters). */
export const VERBATIM_MAX_CHARS = 1_200

export type Role = 'interviewee' | 'interviewer' | 'unknown'

/** One turn (or part of a long turn) of a chunk, as it is sent: known names as placeholders. */
export type SentTurn = {
  readonly id: string
  readonly segmentId: string
  readonly speaker: string | null
  /** Where the part starts in the turn's text. */
  readonly offset: number
  /** The part as the analysed text writes it. */
  readonly text: string
  /** The part as it is sent. */
  readonly sent: string
  readonly cuts: readonly { start: number; end: number; placeholder: string }[]
  readonly context: boolean
}

export const sendTurn = (
  turn: Omit<SentTurn, 'sent' | 'cuts'>,
  names: readonly string[],
): SentTurn => {
  const sent = withPlaceholders(turn.text, names)
  return { ...turn, sent: sent.text, cuts: sent.cuts }
}

/** A verbatim the app kept: the turn's own words, at their place in the analysed text. */
export type FoundVerbatim = {
  readonly segmentId: string
  readonly offset: number
  readonly length: number
  readonly text: string
  readonly speaker: string | null
  readonly reason: string | null
}

const SPACE = /\s/
const normalChar = (ch: string) =>
  ch
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()

/**
 * Where a quote is in a text, ignoring case, spaces and apostrophe or quote style (the rule of
 * `quoteFound`). The first place from `from` on, else the first place; null when absent.
 */
export const locate = (
  text: string,
  quote: string,
  from = 0,
): { start: number; end: number } | null => {
  let out = ''
  const at: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ''
    if (SPACE.test(ch)) {
      if (space || out.length === 0) continue
      space = true
      out += ' '
      at.push(i)
      continue
    }
    space = false
    for (const c of normalChar(ch)) {
      out += c
      at.push(i)
    }
  }
  const wanted = normaliseQuote(quote)
  if (!wanted) return null
  const fromOut = at.findIndex((i) => i >= from)
  let index = fromOut >= 0 ? out.indexOf(wanted, fromOut) : -1
  if (index < 0) index = out.indexOf(wanted)
  if (index < 0) return null
  const start = at[index] ?? 0
  const end = (at[index + wanted.length - 1] ?? start) + 1
  return { start, end }
}

/** A place in the sent text back in the real text; null inside a placeholder. */
const toReal = (turn: SentTurn, sentAt: number): number | null => {
  let shift = 0
  for (const c of turn.cuts) {
    const sentStart = c.start + shift
    if (sentAt <= sentStart) break
    if (sentAt < sentStart + c.placeholder.length) return null
    shift += c.placeholder.length - (c.end - c.start)
  }
  return sentAt - shift
}

const wordCount = (text: string) => words(text).length

const overlaps = (
  a: { segmentId: string; offset: number; length: number },
  b: { segmentId: string; offset: number; length: number },
) => a.segmentId === b.segmentId && a.offset < b.offset + b.length && b.offset < a.offset + a.length

/**
 * FR-005, research R6: the verbatims of an answer the app keeps. A quote is kept when its turn is
 * new in the chunk, not an interviewer's, the quote is in the turn as sent and does not cut a
 * placeholder in two, and it has 3 to 120 words. Of two overlapping quotes of a turn, the longer stays.
 */
export const checkVerbatims = (
  turns: readonly SentTurn[],
  answer: readonly { turn: string; text: string; reason: string | null }[],
  roleOf: (speaker: string | null) => Role,
): { kept: FoundVerbatim[]; leftOut: number } => {
  const byId = new Map(turns.map((t) => [t.id, t]))
  const candidates: FoundVerbatim[] = []
  let leftOut = 0
  for (const a of answer) {
    const turn = byId.get(a.turn)
    const place =
      turn && !turn.context && a.text.length <= VERBATIM_MAX_CHARS
        ? locate(turn.sent, a.text)
        : null
    const start = turn && place ? toReal(turn, place.start) : null
    const end = turn && place ? toReal(turn, place.end) : null
    if (!turn || start === null || end === null || roleOf(turn.speaker) === 'interviewer') {
      leftOut++
      continue
    }
    const text = turn.text.slice(start, end)
    const count = wordCount(text)
    if (count < VERBATIM_MIN_WORDS || count > VERBATIM_MAX_WORDS) {
      leftOut++
      continue
    }
    candidates.push({
      segmentId: turn.segmentId,
      offset: turn.offset + start,
      length: end - start,
      text,
      speaker: turn.speaker,
      reason: a.reason?.slice(0, 200) ?? null,
    })
  }
  const kept: FoundVerbatim[] = []
  for (const c of [...candidates].sort((a, b) => b.length - a.length)) {
    if (kept.some((k) => overlaps(k, c))) leftOut++
    else kept.push(c)
  }
  kept.sort((a, b) => a.segmentId.localeCompare(b.segmentId) || a.offset - b.offset)
  return { kept, leftOut }
}

/**
 * Research R7: a verbatim found again (same turn, overlapping) is the one the interview has; one
 * overlapping a verbatim set aside is never brought back; the others are new.
 */
export const mergeVerbatims = <
  E extends {
    readonly id: string
    readonly segmentId: string
    readonly offset: number
    readonly length: number
    readonly setAside: boolean
  },
>(
  existing: readonly E[],
  found: readonly FoundVerbatim[],
): { reused: string[]; added: FoundVerbatim[] } => {
  const reused = new Set<string>()
  const added: FoundVerbatim[] = []
  for (const f of found) {
    const same = existing.filter((e) => overlaps(e, f))
    if (same.some((e) => e.setAside)) continue
    const first = same[0]
    if (first) reused.add(first.id)
    else added.push(f)
  }
  return { reused: [...reused], added }
}

/**
 * Research R3: where a verbatim's text is now — in its turn (nearest its last place), else in
 * another turn of the same speaker; null when it is no longer in the analysed text.
 */
export const reanchor = (
  verbatim: {
    readonly segmentId: string
    readonly offset: number
    readonly text: string
    readonly speaker: string | null
  },
  turns: readonly { readonly id: string; readonly speaker: string | null; readonly text: string }[],
): { segmentId: string; offset: number; length: number } | null => {
  const own = turns.find((t) => t.id === verbatim.segmentId)
  const others = turns.filter((t) => t.id !== verbatim.segmentId && t.speaker === verbatim.speaker)
  for (const t of own ? [own, ...others] : others) {
    const place = locate(t.text, verbatim.text, t === own ? verbatim.offset : 0)
    if (place) return { segmentId: t.id, offset: place.start, length: place.end - place.start }
  }
  return null
}
