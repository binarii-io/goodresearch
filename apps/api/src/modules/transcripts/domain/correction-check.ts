import type { Chunk, ChunkTurn } from '@goodresearch/shared'
import { fromPlaceholders, PLACEHOLDER, withPlaceholders, words } from '@goodresearch/shared'
import type {
  Confidence,
  Correction,
  CorrectionKind,
  OffsetMap,
  OpenPlace,
  Suggestion,
} from './corrections.ts'
import type { Segment } from './segments.ts'

/** Spec 011 clarification: one AI correction changes at most 8 words. */
export const MAX_CHANGED_WORDS = 8
export const REASON_MAX = 200
const ONE_PLACEHOLDER = new RegExp(PLACEHOLDER.source)

type Cut = { readonly start: number; readonly end: number; readonly placeholder: string }

/** A chunk turn as sent: the known names replaced by placeholders. */
export type SentTurn = ChunkTurn & {
  readonly sent: string
  readonly speakerSent: string | null
  readonly cuts: readonly Cut[]
}

/** A case-by-case place the AI decides, under a short id. */
export type SentPlace = {
  readonly id: string
  readonly turn: string
  readonly termId: string
  readonly segmentId: string
  /** In the raw turn. */
  readonly offset: number
  readonly spelling: string
  readonly form: string
}

export type SentChunk = {
  readonly turns: readonly SentTurn[]
  readonly occurrences: readonly SentPlace[]
  readonly placeholders: ReadonlyMap<string, string>
}

/** The clean offset of a raw one outside replaced spans. */
const toClean = (map: OffsetMap, raw: number): number | null => {
  let shift = 0
  for (const span of map) {
    if (raw < span.rawStart) break
    if (raw < span.rawEnd) return null
    shift = span.cleanEnd - span.rawEnd
  }
  return raw + shift
}

/**
 * FR-007: what goes to the AI for a chunk — every known name replaced by a placeholder in the
 * text and the speakers — and the open case-by-case places of its new turns.
 */
export const prepareChunk = (
  chunk: Chunk,
  knownNames: readonly string[],
  places: readonly OpenPlace[],
  maps: ReadonlyMap<string, OffsetMap>,
): SentChunk => {
  const placeholders = withPlaceholders('', knownNames).names
  const turns = chunk.turns.map((t): SentTurn => {
    const { text, cuts } = withPlaceholders(t.text, knownNames)
    return {
      ...t,
      sent: text,
      cuts,
      speakerSent: t.speaker === null ? null : withPlaceholders(t.speaker, knownNames).text,
    }
  })
  const occurrences: SentPlace[] = []
  for (const p of places) {
    const at = toClean(maps.get(p.segmentId) ?? [], p.offset)
    const turn = turns.find(
      (t) =>
        !t.context &&
        t.segmentId === p.segmentId &&
        at !== null &&
        at >= t.offset &&
        at + p.length <= t.offset + t.text.length,
    )
    if (turn)
      occurrences.push({
        id: `o${occurrences.length + 1}`,
        turn: turn.id,
        termId: p.termId,
        segmentId: p.segmentId,
        offset: p.offset,
        // A known name is replaced here too (review of PR #11).
        spelling: withPlaceholders(p.spelling, knownNames).text,
        form: withPlaceholders(p.form, knownNames).text,
      })
  }
  return { turns, occurrences, placeholders }
}

export type AnswerCorrection = {
  readonly turn: string
  readonly kind: CorrectionKind
  readonly original: string
  readonly before: string | null
  readonly replacement: string
  readonly reason: string | null
  readonly confidence: Confidence
}

export type AnswerDecision = {
  readonly occurrence: string
  readonly isTerm: boolean
  readonly reason: string | null
}

/** Case, spaces and apostrophe or quote style do not count; each kept character keeps its place. */
const normalised = (text: string): { text: string; at: number[] } => {
  let out = ''
  const at: number[] = []
  let space = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ''
    if (/\s/.test(ch)) {
      if (!space && out.length > 0) {
        out += ' '
        at.push(i)
      }
      space = true
      continue
    }
    space = false
    for (const c of ch
      .replace(/[‘’ʼ`´]/, "'")
      .replace(/[“”«»]/, '"')
      .toLowerCase()) {
      out += c
      at.push(i)
    }
  }
  return { text: out, at }
}

const LETTER = /[\p{L}\p{N}]/u

/** Every place of `needle` in `text` on word boundaries, in the text's own offsets. */
const locate = (text: string, needle: string): { start: number; end: number }[] => {
  const hay = normalised(text)
  const wanted = normalised(needle.trim()).text.trim()
  if (!wanted) return []
  const out: { start: number; end: number }[] = []
  for (let i = hay.text.indexOf(wanted); i >= 0; i = hay.text.indexOf(wanted, i + wanted.length)) {
    const start = hay.at[i] ?? 0
    const end = (hay.at[i + wanted.length - 1] ?? 0) + 1
    if (LETTER.test(text[start - 1] ?? '') || LETTER.test(text[end] ?? '')) continue
    out.push({ start, end })
  }
  return out
}

/** The sent offset of a placeholder-free span, in the turn's text before placeholders. */
const fromSent = (cuts: readonly Cut[], start: number, end: number): number | null => {
  let shift = 0
  for (const c of cuts) {
    const sentStart = c.start + shift
    const sentEnd = sentStart + c.placeholder.length
    if (end <= sentStart) break
    if (start < sentEnd) return null
    shift += c.placeholder.length - (c.end - c.start)
  }
  return start - shift
}

/**
 * Only the words that change (shared words at both ends left out, one kept on each side when a
 * side would be empty), and how many change.
 */
const narrow = (
  original: string,
  replacement: string,
): { offset: number; original: string; replacement: string; changed: number } => {
  const o = words(original)
  const r = words(replacement)
  let p = 0
  while (p < o.length && p < r.length && o[p]?.text === r[p]?.text) p++
  let s = 0
  while (
    s < o.length - p &&
    s < r.length - p &&
    o[o.length - 1 - s]?.text === r[r.length - 1 - s]?.text
  )
    s++
  if (o.length - p - s === 0 || r.length - p - s === 0) {
    if (p > 0) p--
    else if (s > 0) s--
  }
  const changed = Math.max(o.length - p - s, r.length - p - s)
  const oFirst = o[p]
  const oLast = o[o.length - 1 - s]
  const rFirst = r[p]
  const rLast = r[r.length - 1 - s]
  if (!oFirst || !oLast || oFirst.start > oLast.start)
    return { offset: 0, original, replacement, changed }
  const cutO = original.slice(oFirst.start, oLast.end)
  const cutR =
    rFirst && rLast && rFirst.start <= rLast.start ? replacement.slice(rFirst.start, rLast.end) : ''
  // Only punctuation changes: keep the whole correction.
  if (cutO === cutR) return { offset: 0, original, replacement, changed }
  return { offset: oFirst.start, original: cutO, replacement: cutR, changed }
}

const cut = (text: string | null, max: number) =>
  text ? Array.from(text.trim()).slice(0, max).join('') || null : null

export type CheckInput = {
  readonly sessionId: string
  readonly chunk: SentChunk
  readonly raw: ReadonlyMap<string, Segment>
  /** Where the lexicon and name corrections moved the text of each turn. */
  readonly maps: ReadonlyMap<string, OffsetMap>
  /** The transcript's speakers, as the clean text writes them. */
  readonly speakers: readonly string[]
  readonly knownNames: readonly string[]
  readonly anonymised: boolean
  /** "[Person]" in the interview's language. */
  readonly neutral: string
  readonly newId: () => string
}

/**
 * Spec 011 FR-006, research R4 (constitution IV): an AI correction is kept only when it is on a
 * new turn of the chunk, its original is found once there (with the words before it), at most 8
 * words change, it changes something, no placeholder or known name is on either side, a speaker
 * is one of the transcript's, and it falls outside the lexicon's and the names' corrections.
 */
export const checkCorrections = (
  input: CheckInput,
  answer: { corrections: readonly AnswerCorrection[]; decisions: readonly AnswerDecision[] },
): { corrections: Correction[]; suggestions: Suggestion[]; leftOut: number } => {
  const byId = new Map(input.chunk.turns.map((t) => [t.id, t]))
  const kept: Correction[] = []
  let leftOut = 0
  const hasName = (text: string) =>
    ONE_PLACEHOLDER.test(text) || withPlaceholders(text, input.knownNames).cuts.length > 0

  const base = (turn: SentTurn, a: AnswerCorrection) => ({
    key: input.newId(),
    sessionId: input.sessionId,
    segmentId: turn.segmentId,
    kind: a.kind,
    source: 'ai-other' as const,
    reason: cut(a.reason, REASON_MAX),
    confidence: a.confidence,
    termId: null,
    status: 'proposed' as const,
    edited: null,
    decidedBy: null,
    decidedAt: null,
    version: 1,
  })

  for (const a of answer.corrections) {
    const turn = byId.get(a.turn)
    const raw = turn ? input.raw.get(turn.segmentId) : undefined
    if (!turn || turn.context || !raw || (a.kind === 'name' && !input.anonymised)) {
      leftOut++
      continue
    }

    if (a.kind === 'speaker') {
      const to = fromPlaceholders(a.replacement.trim(), input.chunk.placeholders)
      if (
        raw.speaker === null ||
        !input.speakers.includes(to) ||
        to === turn.speaker ||
        to === raw.speaker
      ) {
        leftOut++
        continue
      }
      kept.push({
        ...base(turn, a),
        target: 'speaker',
        offset: 0,
        length: raw.speaker.length,
        original: raw.speaker,
        replacement: to,
      })
      continue
    }

    // Where it is: with the words before it when given, else the original alone, found once.
    const withBefore = a.before?.trim() ? locate(turn.sent, `${a.before.trim()} ${a.original}`) : []
    const alone = locate(turn.sent, a.original)
    let span: { start: number; end: number } | undefined
    if (withBefore.length === 1) span = alone.find((x) => x.end === withBefore[0]?.end)
    else if (withBefore.length === 0 && alone.length === 1) span = alone[0]
    const replacement = a.kind === 'name' ? input.neutral : a.replacement.trim()
    if (!span || hasName(replacement)) {
      leftOut++
      continue
    }
    const sentOriginal = turn.sent.slice(span.start, span.end)
    const n = narrow(sentOriginal, replacement)
    const start = span.start + n.offset
    const end = start + n.original.length
    if (n.changed > MAX_CHANGED_WORDS || n.original === n.replacement || n.original === '') {
      leftOut++
      continue
    }
    const inPart = fromSent(turn.cuts, start, end)
    if (inPart === null) {
      leftOut++
      continue
    }
    const appliedStart = turn.offset + inPart
    const appliedEnd = appliedStart + n.original.length
    const map = input.maps.get(turn.segmentId) ?? []
    if (map.some((m) => appliedStart < m.cleanEnd && m.cleanStart < appliedEnd)) {
      leftOut++
      continue
    }
    let shift = 0
    for (const m of map) if (m.cleanEnd <= appliedStart) shift = m.rawEnd - m.cleanEnd
    const rawStart = appliedStart + shift
    const original = raw.text.slice(rawStart, rawStart + n.original.length)
    if (original !== n.original) {
      leftOut++
      continue
    }
    kept.push({
      ...base(turn, a),
      target: 'text',
      offset: rawStart,
      length: original.length,
      original,
      replacement: n.replacement,
    })
  }

  const places = new Map(input.chunk.occurrences.map((o) => [o.id, o]))
  const suggestions: Suggestion[] = []
  for (const d of answer.decisions) {
    const place = places.get(d.occurrence)
    if (!place) continue
    places.delete(d.occurrence)
    suggestions.push({
      termId: place.termId,
      sessionId: input.sessionId,
      segmentId: place.segmentId,
      offset: place.offset,
      isTerm: d.isTerm,
      reason: cut(d.reason, REASON_MAX),
    })
  }
  return { corrections: kept, suggestions, leftOut }
}
