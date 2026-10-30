import { fold, isAcronym, words } from '@goodresearch/shared'
import type { Interview, TermLanguage } from './candidates.ts'
import type { LexiconTerm } from './lexicon-term.ts'
import type { Verdict } from './occurrences.ts'
import type { Segment } from './segments.ts'

export type Target = 'text' | 'speaker'
export type CorrectionKind = 'term' | 'transcription' | 'speaker' | 'name'
/** Spec 011 FR-008; `lexicon` is the context map's `rule`. */
export type CorrectionSource = 'person' | 'lexicon' | 'name' | 'ai-lexicon' | 'ai-other'
export type CorrectionStatus = 'proposed' | 'accepted' | 'edited' | 'rejected'
export type Confidence = 'high' | 'medium' | 'low'

/** A change on one turn of an interview's raw version (context map Edit). */
export type Correction = {
  /** `lex:<termId>:<segmentId>:<offset>`, `name:<segmentId>:<target>:<offset>`, or a stored id. */
  readonly key: string
  readonly sessionId: string
  readonly segmentId: string
  readonly target: Target
  /** In the raw turn's text (0 for the speaker). */
  readonly offset: number
  readonly length: number
  readonly original: string
  /** As found; a person's edit goes in `edited`. */
  readonly replacement: string
  readonly edited: string | null
  readonly kind: CorrectionKind
  readonly source: CorrectionSource
  readonly reason: string | null
  readonly confidence: Confidence | null
  readonly termId: string | null
  readonly status: CorrectionStatus
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  /** Stored corrections only. */
  readonly version: number | null
}

/** The AI's yes / no on a case-by-case occurrence without verdict (research R2). */
export type Suggestion = {
  readonly termId: string
  readonly sessionId: string
  readonly segmentId: string
  readonly offset: number
  readonly isTerm: boolean
  readonly reason: string | null
}

/** A person's decision on a computed name correction. */
export type NameDecision = {
  readonly status: 'accepted' | 'rejected' | 'edited'
  readonly edited: string | null
  readonly decidedBy: string
  readonly decidedAt: Date
}

/** What a correction writes. */
export const textOf = (c: Correction): string => c.edited ?? c.replacement

const isAccepted = (t: LexiconTerm) => t.status === 'accepted' || t.status === 'edited'

type Span = { readonly start: number; readonly end: number }

/** A spelling ready to be compared: `order` keeps the terms' order where two match the same words. */
type Compiled = {
  readonly order: number
  readonly term: LexiconTerm
  readonly spelling: string
  readonly wanted: readonly { readonly key: string; readonly acronym: boolean }[]
}

type Match = Span & {
  readonly term: LexiconTerm
  readonly segment: Segment
  readonly spelling: string
}

/**
 * The places of the accepted terms in an interview: their form and accepted variants (proposed
 * variants are not used yet), the longest wins where spellings overlap (as spec 010 counts them).
 * Runs on every list of interviews, in the request: spellings are looked up by their first word,
 * not compared with every word of every turn.
 */
const lexiconMatches = (interview: Interview, terms: readonly LexiconTerm[]): Match[] => {
  const folded = new Map<string, string>()
  const foldOf = (word: string) => {
    let known = folded.get(word)
    if (known === undefined) {
      known = fold(word)
      folded.set(word, known)
    }
    return known
  }
  // An acronym matches as written, any other word whatever its case or accents.
  const byAcronym = new Map<string, Compiled[]>()
  const byFolded = new Map<string, Compiled[]>()
  let order = 0
  for (const term of terms) {
    if (!isAccepted(term) || term.category === 'person' || term.language !== interview.language)
      continue
    const accepted = term.variants.filter((v) => v.status === 'accepted').map((v) => v.spelling)
    for (const spelling of [term.form, ...accepted]) {
      const wanted = words(spelling).map(({ text }) => {
        const acronym = isAcronym(text)
        return { acronym, key: acronym ? text : foldOf(text) }
      })
      const first = wanted[0]
      if (!first) continue
      const index = first.acronym ? byAcronym : byFolded
      const list = index.get(first.key) ?? []
      list.push({ order: order++, term, spelling, wanted })
      index.set(first.key, list)
    }
  }

  const out: Match[] = []
  for (const segment of interview.segments) {
    const all = words(segment.text)
    const found: (Match & { readonly order: number })[] = []
    // Where each spelling may match again: its own matches do not overlap.
    const nextFrom = new Map<Compiled, number>()
    for (const [i, word] of all.entries()) {
      for (const index of [byAcronym, byFolded]) {
        for (const c of index.get(index === byAcronym ? word.text : foldOf(word.text)) ?? []) {
          if ((nextFrom.get(c) ?? 0) > i || i + c.wanted.length > all.length) continue
          const same = c.wanted.every((w, k) => {
            const at = all[i + k]?.text ?? ''
            return w.acronym ? w.key === at : w.key === foldOf(at)
          })
          const last = all[i + c.wanted.length - 1]
          if (!same || !last) continue
          nextFrom.set(c, i + c.wanted.length)
          found.push({
            start: word.start,
            end: last.end,
            term: c.term,
            segment,
            spelling: c.spelling,
            order: c.order,
          })
        }
      }
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order)
    let end = -1
    for (const m of found) {
      if (m.start < end) continue
      end = m.end
      out.push(m)
    }
  }
  return out
}

const replacementOf = (t: LexiconTerm): string | null =>
  t.kind === 'suspect' ? t.correction : t.form

const placeKey = (termId: string, segmentId: string, offset: number) =>
  `${termId}|${segmentId}|${offset}`

/**
 * Spec 011 FR-003, research R2: the lexicon's corrections of one interview, computed each time.
 * Scope `global`: every occurrence, accepted unless its verdict is no. Scope `case-by-case`: the
 * verdicts decide; without one, an AI yes gives an `ai-lexicon` proposal. An `unsure` verdict, in
 * either scope, leaves a proposal for a person.
 */
export const lexiconCorrections = (
  interview: Interview & { readonly sessionId: string },
  terms: readonly LexiconTerm[],
  verdicts: readonly Verdict[],
  suggestions: readonly Suggestion[],
): Correction[] => {
  const byPlace = new Map(verdicts.map((v) => [placeKey(v.termId, v.segmentId, v.offset), v]))
  const suggested = new Map(suggestions.map((s) => [placeKey(s.termId, s.segmentId, s.offset), s]))
  const out: Correction[] = []
  for (const m of lexiconMatches(interview, terms)) {
    const replacement = replacementOf(m.term)
    const original = m.segment.text.slice(m.start, m.end)
    if (!replacement || original === replacement) continue
    const place = placeKey(m.term.id, m.segment.id, m.start)
    const verdict = byPlace.get(place)
    const suggestion = suggested.get(place)
    const base = {
      key: `lex:${m.term.id}:${m.segment.id}:${m.start}`,
      sessionId: interview.sessionId,
      segmentId: m.segment.id,
      target: 'text' as const,
      offset: m.start,
      length: m.end - m.start,
      original,
      replacement,
      edited: null,
      kind: m.term.kind === 'suspect' ? ('transcription' as const) : ('term' as const),
      confidence: null,
      termId: m.term.id,
      version: null,
    }
    if (verdict?.verdict === 'unsure') {
      // The person could not tell: a person decides it in context, the AI is not asked.
      out.push({
        ...base,
        source: 'lexicon',
        reason: null,
        status: 'proposed',
        decidedBy: null,
        decidedAt: null,
      })
    } else if (verdict) {
      out.push({
        ...base,
        source: 'lexicon',
        reason: suggestion?.reason ?? null,
        status: verdict.verdict === 'yes' ? 'accepted' : 'rejected',
        decidedBy: verdict.decidedBy,
        decidedAt: verdict.decidedAt,
      })
    } else if (m.term.scope === 'global') {
      out.push({
        ...base,
        source: 'lexicon',
        reason: null,
        status: 'accepted',
        decidedBy: null,
        decidedAt: null,
      })
    } else if (suggestion?.isTerm) {
      out.push({
        ...base,
        source: 'ai-lexicon',
        reason: suggestion.reason,
        status: 'proposed',
        decidedBy: null,
        decidedAt: null,
      })
    }
  }
  return out
}

/** A case-by-case place without verdict: the AI decides it in context (FR-004). */
export type OpenPlace = {
  readonly termId: string
  readonly segmentId: string
  readonly offset: number
  readonly length: number
  readonly spelling: string
  readonly form: string
}

export const caseByCaseToDecide = (
  interview: Interview,
  terms: readonly LexiconTerm[],
  verdicts: readonly Verdict[],
): OpenPlace[] => {
  const judged = new Set(verdicts.map((v) => placeKey(v.termId, v.segmentId, v.offset)))
  return lexiconMatches(interview, terms)
    .filter(
      (m) =>
        m.term.scope === 'case-by-case' &&
        replacementOf(m.term) !== null &&
        m.segment.text.slice(m.start, m.end) !== replacementOf(m.term) &&
        !judged.has(placeKey(m.term.id, m.segment.id, m.start)),
    )
    .map((m) => ({
      termId: m.term.id,
      segmentId: m.segment.id,
      offset: m.start,
      length: m.end - m.start,
      spelling: m.segment.text.slice(m.start, m.end),
      form: replacementOf(m.term) ?? m.term.form,
    }))
}

/** A person of the interview with their code: `P01` (interviewee) or `I01` (interviewer). */
export type Person = {
  readonly name: string
  readonly role: 'interviewer' | 'interviewee'
  readonly code: string
}

const LABELS = {
  en: { interviewer: 'Interviewer', person: '[Person]' },
  fr: { interviewer: 'Intervieweur', person: '[Personne]' },
} as const

const labelsFor = (language: TermLanguage) => (language === 'fr' ? LABELS.fr : LABELS.en)

/** What a person becomes in the clean version (research R5). */
export const labelOf = (person: Person, language: TermLanguage): string =>
  person.role === 'interviewer'
    ? `${labelsFor(language).interviewer} ${Number(person.code.replace(/^\D+/, '')) || 1}`
    : person.code

/** A person's name and each of its words (2 letters or more) as whole-word patterns. */
type NamePattern = { readonly words: readonly string[]; readonly label: string }

const nameWords = (name: string) => words(name).map((w) => fold(w.text))

/**
 * Spec 011 FR-012, research R5 (anonymisation on): the known people's names become their label
 * in the text and in the speakers, accepted by default; people terms become a neutral label. A
 * word two people share names neither of them.
 */
export const nameCorrections = (
  interview: Interview & { readonly sessionId: string },
  people: readonly Person[],
  personTerms: readonly LexiconTerm[],
  decisions: ReadonlyMap<string, NameDecision>,
): Correction[] => {
  const neutral = labelsFor(interview.language).person
  const patterns: NamePattern[] = []
  const owners = new Map<string, Set<string>>()
  const add = (spelling: string, label: string) => {
    const w = nameWords(spelling)
    if (w.length === 0) return
    patterns.push({ words: w, label })
    if (w.length > 1)
      for (const one of w)
        if (one.length >= 2) {
          owners.set(one, new Set([...(owners.get(one) ?? []), label]))
          patterns.push({ words: [one], label })
        }
  }
  for (const p of people) add(p.name, labelOf(p, interview.language))
  for (const t of personTerms.filter((t) => t.status !== 'merged' && t.status !== 'rejected'))
    for (const s of [
      t.form,
      ...t.variants.filter((v) => v.status !== 'rejected').map((v) => v.spelling),
    ])
      add(s, neutral)
  const usable = patterns
    .filter((p) => p.words.length > 1 || (owners.get(p.words[0] ?? '')?.size ?? 1) <= 1)
    .sort((a, b) => b.words.length - a.words.length)
  // By first word, the longest first: computed for every interview of a list, in the request.
  const byFirstWord = new Map<string, NamePattern[]>()
  for (const p of usable) {
    const first = p.words[0] ?? ''
    byFirstWord.set(first, [...(byFirstWord.get(first) ?? []), p])
  }
  const foldedWords = new Map<string, string>()
  const foldOf = (word: string) => {
    let known = foldedWords.get(word)
    if (known === undefined) {
      known = fold(word)
      foldedWords.set(word, known)
    }
    return known
  }

  const make = (
    segment: Segment,
    target: Target,
    offset: number,
    original: string,
    replacement: string,
  ): Correction => {
    const key = `name:${segment.id}:${target}:${offset}`
    const decision = decisions.get(key)
    return {
      key,
      sessionId: interview.sessionId,
      segmentId: segment.id,
      target,
      offset,
      length: original.length,
      original,
      replacement,
      edited: decision?.status === 'edited' ? decision.edited : null,
      kind: 'name',
      source: 'name',
      reason: null,
      confidence: null,
      termId: null,
      status: decision?.status ?? 'accepted',
      decidedBy: decision?.decidedBy ?? null,
      decidedAt: decision?.decidedAt ?? null,
      version: null,
    }
  }

  const out: Correction[] = []
  for (const segment of interview.segments) {
    if (segment.speaker) {
      const key = nameWords(segment.speaker)
      const hit = usable.find(
        (p) => p.words.length === key.length && p.words.every((w, i) => w === key[i]),
      )
      if (hit && hit.label !== segment.speaker)
        out.push(make(segment, 'speaker', 0, segment.speaker, hit.label))
    }
    const all = words(segment.text)
    const folded = all.map((w) => foldOf(w.text))
    for (let i = 0; i < all.length; ) {
      const hit = byFirstWord
        .get(folded[i] ?? '')
        ?.find((p) => p.words.every((w, k) => folded[i + k] === w))
      const first = all[i]
      const last = hit ? all[i + hit.words.length - 1] : undefined
      if (!hit || !first || !last) {
        i++
        continue
      }
      const original = segment.text.slice(first.start, last.end)
      if (original !== hit.label) out.push(make(segment, 'text', first.start, original, hit.label))
      i += hit.words.length
    }
  }
  return out
}

const PRIORITY: Record<CorrectionSource, number> = {
  person: 0,
  lexicon: 1,
  name: 2,
  'ai-lexicon': 3,
  'ai-other': 4,
}

export type Resolved = Correction & { readonly overridden: boolean }

/**
 * Research R3: at each place one correction applies — person > lexicon > name > ai-lexicon >
 * ai-other, then the longest. Rejected corrections take no place.
 */
export const resolveCorrections = (all: readonly Correction[]): Resolved[] => {
  const order = [...all].sort(
    (a, b) => PRIORITY[a.source] - PRIORITY[b.source] || b.length - a.length,
  )
  const taken = new Map<string, Span[]>()
  const overridden = new Set<string>()
  for (const c of order) {
    if (c.status === 'rejected') continue
    const where = `${c.segmentId}|${c.target}`
    const spans = taken.get(where) ?? []
    const span =
      c.target === 'speaker' ? { start: 0, end: 1 } : { start: c.offset, end: c.offset + c.length }
    if (spans.some((s) => span.start < s.end && s.start < span.end)) overridden.add(c.key)
    else taken.set(where, [...spans, span])
  }
  return all.map((c) => ({ ...c, overridden: overridden.has(c.key) }))
}

/** What the clean version applies: accepted or edited, not overridden. */
export const effectiveCorrections = (all: readonly Correction[]): Correction[] =>
  resolveCorrections(all)
    .filter((c) => !c.overridden && (c.status === 'accepted' || c.status === 'edited'))
    .map(({ overridden: _, ...c }) => c)

/**
 * Spec 012 research R2: what the text analysed applies by default — every correction not rejected
 * and not overridden, those still to decide included (as the prototype read them).
 */
export const analysedCorrections = (all: readonly Correction[]): Correction[] =>
  resolveCorrections(all)
    .filter((c) => !c.overridden && c.status !== 'rejected')
    .map(({ overridden: _, ...c }) => c)

/** What is left to decide: proposed and not overridden. */
export const toDecideOf = (all: readonly Correction[]): Correction[] =>
  resolveCorrections(all)
    .filter((c) => !c.overridden && c.status === 'proposed')
    .map(({ overridden: _, ...c }) => c)

/** One replaced span of a turn: where it was in the raw text and where it is in the clean one. */
export type OffsetMap = readonly {
  readonly rawStart: number
  readonly rawEnd: number
  readonly cleanStart: number
  readonly cleanEnd: number
}[]

/** The raw offset of a clean offset, or null inside a replaced span. */
export const toRawOffset = (map: OffsetMap, clean: number): number | null => {
  let shift = 0
  for (const span of map) {
    if (clean < span.cleanStart) break
    if (clean < span.cleanEnd) return null
    shift = span.rawEnd - span.cleanEnd
  }
  return clean + shift
}

/** The turns with the corrections applied (same ids), and per turn where the text moved. */
export const applyCorrections = (
  segments: readonly Segment[],
  effective: readonly Correction[],
): { segments: Segment[]; maps: Map<string, OffsetMap> } => {
  const bySegment = new Map<string, Correction[]>()
  for (const c of effective) bySegment.set(c.segmentId, [...(bySegment.get(c.segmentId) ?? []), c])
  const maps = new Map<string, OffsetMap>()
  const out = segments.map((s) => {
    const mine = bySegment.get(s.id) ?? []
    const speaker = mine.find((c) => c.target === 'speaker')
    const edits = mine.filter((c) => c.target === 'text').sort((a, b) => a.offset - b.offset)
    let text = ''
    let at = 0
    const map: OffsetMap[number][] = []
    for (const e of edits) {
      if (e.offset < at || s.text.slice(e.offset, e.offset + e.length) !== e.original) continue
      text += s.text.slice(at, e.offset)
      const cleanStart = text.length
      text += textOf(e)
      map.push({
        rawStart: e.offset,
        rawEnd: e.offset + e.length,
        cleanStart,
        cleanEnd: text.length,
      })
      at = e.offset + e.length
    }
    text += s.text.slice(at)
    maps.set(s.id, map)
    return { ...s, speaker: speaker ? textOf(speaker) : s.speaker, text }
  })
  return { segments: out, maps }
}

/** A stable hash of what a clean version applies (research R7); the order does not count. */
export const fingerprint = (effective: readonly Correction[]): string => {
  const text = effective
    .map((c) => `${c.key}=${textOf(c)}`)
    .sort()
    .join('\n')
  // cyrb53: enough to tell two sets apart, not a security hash.
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * FR-008: a new AI correction equal to one decided before (same turn, target, original and
 * replacement) takes that decision.
 */
export const inherit = (
  found: readonly Correction[],
  decided: readonly Correction[],
): Correction[] => {
  const same = (c: Correction) => `${c.segmentId}|${c.target}|${c.original}|${c.replacement}`
  const known = new Map(decided.filter((d) => d.status !== 'proposed').map((d) => [same(d), d]))
  return found.map((c) => {
    const d = known.get(same(c))
    return d
      ? { ...c, status: d.status, edited: d.edited, decidedBy: d.decidedBy, decidedAt: d.decidedAt }
      : c
  })
}
