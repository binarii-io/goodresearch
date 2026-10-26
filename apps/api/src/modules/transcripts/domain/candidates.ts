import { fold, isAcronym, PLACEHOLDER, withPlaceholders, words } from '@goodresearch/shared'
import type { Segment } from './segments.ts'

export type TermLanguage = 'en' | 'fr' | 'other'

/** Is this word (folded) a common word of the language? (research R2) */
export type CommonWords = (language: TermLanguage, folded: string) => boolean

/** The spellings of the team's lexicon, as the rules need them. */
export type KnownSpelling = {
  readonly termId: string
  readonly language: TermLanguage
  readonly spelling: string
  /** `active`: a term or variant not rejected (counted, never proposed); `rejected`: never again. */
  readonly state: 'active' | 'rejected'
  /** Accepted forms are given to the AI when a candidate is close to them. */
  readonly accepted: boolean
}

export type Interview = {
  readonly sessionId: string
  readonly language: TermLanguage
  readonly segments: readonly Segment[]
}

export type Reason = 'uncommon' | 'capitalised' | 'acronym' | 'close'

export type Place = {
  readonly sessionId: string
  readonly segmentId: string
  readonly start: number
  readonly end: number
}

export type Candidate = {
  /** The spelling found most often. */
  readonly spelling: string
  readonly folded: string
  readonly language: TermLanguage
  readonly count: number
  readonly sessions: number
  readonly reasons: readonly Reason[]
  /** The known term it is close to (research R4). */
  readonly closeTo: string | null
  /** Up to 10 places, for the excerpts. */
  readonly places: readonly Place[]
}

/** Most candidates sent to the AI per reading (spec FR-018). */
export const CANDIDATE_LIMIT = 300
const PLACES_KEPT = 10
const PHRASE_MAX = 3

/**
 * Optimal string alignment distance (Damerau–Levenshtein with adjacent transpositions), stopping
 * early above `max`.
 */
export const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0)
    row[0] = i
    rows.push(row)
  }
  for (let j = 0; j <= b.length; j++) (rows[0] as number[])[j] = j
  for (let i = 1; i <= a.length; i++) {
    const row = rows[i] as number[]
    const up = rows[i - 1] as number[]
    let best = row[0] as number
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(
        (up[j] as number) + 1,
        (row[j - 1] as number) + 1,
        (up[j - 1] as number) + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, ((rows[i - 2] as number[])[j - 2] as number) + 1)
      row[j] = d
      best = Math.min(best, d)
    }
    if (best > max) return max + 1
  }
  return (rows[a.length] as number[])[b.length] as number
}

/** Close enough to be the same term: 1 edit up to 6 letters, 2 above. */
export const isClose = (a: string, b: string): boolean => {
  if (a === b) return false
  const max = Math.min(a.length, b.length) <= 6 ? 1 : 2
  return editDistance(a, b, max) <= max
}

const ELISION = /^(?:qu|[cdjlmnst])'/
const POSSESSIVE = /'s$/

/** A word is common when it, or its parts (elision, possessive, hyphen), are common words. */
const commonWord = (common: CommonWords, language: TermLanguage, folded: string): boolean => {
  if (common(language, folded)) return true
  const bare = folded.replace(ELISION, '').replace(POSSESSIVE, '')
  if (bare !== folded && common(language, bare)) return true
  const parts = bare.split('-')
  return parts.length > 1 && parts.every((p) => p.length === 0 || common(language, p))
}

const SENTENCE_END = /[.?!…:;]["»”)\]]*\s*$/

type Token = {
  readonly text: string
  readonly folded: string
  readonly start: number
  readonly end: number
  readonly sentenceStart: boolean
}

const tokensOf = (text: string): Token[] => {
  const hidden: [number, number][] = [...text.matchAll(PLACEHOLDER)].map((m) => [
    m.index,
    m.index + m[0].length,
  ])
  const out: Token[] = []
  let previousEnd = 0
  for (const w of words(text)) {
    const between = text.slice(previousEnd, w.start)
    previousEnd = w.end
    if (hidden.some(([s, e]) => w.start >= s && w.end <= e)) continue
    const sentenceStart =
      out.length === 0 || between.includes('\n') || SENTENCE_END.test(text.slice(0, w.start))
    out.push({ text: w.text, folded: fold(w.text), start: w.start, end: w.end, sentenceStart })
  }
  return out
}

const isCapitalised = (word: string) => /^\p{Lu}/u.test(word) && !isAcronym(word)
const isNumber = (word: string) => /^[\p{N}'-]+$/u.test(word)

type Found = {
  spellings: Map<string, number>
  language: TermLanguage
  count: number
  sessions: Set<string>
  reasons: Set<Reason>
  places: Place[]
}

/**
 * Research R4: the words and phrases of the study's interviews that may be terms, by the app's rules
 * only — absent from the common words, capitalised inside a sentence, acronyms, close to a known
 * spelling. Known names, speaker labels, placeholders, short words, rejected and known spellings are
 * left out. Ranked by interviews then count; at most 300, close spellings always kept.
 */
export const findCandidates = (input: {
  readonly interviews: readonly Interview[]
  readonly common: CommonWords
  readonly knownNames: readonly string[]
  readonly lexicon: readonly KnownSpelling[]
}): { candidates: Candidate[]; leftOut: number } => {
  const nameWords = new Set<string>()
  const addName = (name: string) => {
    for (const w of words(name)) if (w.text.length >= 2) nameWords.add(fold(w.text))
  }
  input.knownNames.forEach(addName)
  for (const i of input.interviews) for (const s of i.segments) if (s.speaker) addName(s.speaker)

  const key = (language: TermLanguage, folded: string) => `${language}\u0000${folded}`
  const known = new Map<string, KnownSpelling>()
  for (const k of input.lexicon) {
    const id = key(k.language, fold(k.spelling))
    // A rejection wins: it is never proposed again.
    if (!known.has(id) || k.state === 'rejected') known.set(id, k)
  }
  const activeByLanguage = new Map<TermLanguage, KnownSpelling[]>()
  for (const k of input.lexicon)
    if (k.state === 'active')
      activeByLanguage.set(k.language, [...(activeByLanguage.get(k.language) ?? []), k])

  const found = new Map<string, Found>()
  const add = (interview: Interview, segment: Segment, run: readonly Token[], reason: Reason) => {
    const first = run[0]
    const last = run.at(-1)
    if (!first || !last) return
    const spelling = segment.text.slice(first.start, last.end)
    const folded = run.map((t) => t.folded).join(' ')
    const id = key(interview.language, folded)
    if (known.has(id)) return
    const f = found.get(id) ?? {
      spellings: new Map<string, number>(),
      language: interview.language,
      count: 0,
      sessions: new Set<string>(),
      reasons: new Set<Reason>(),
      places: [],
    }
    found.set(id, f)
    f.reasons.add(reason)
    // One count per place, whatever the number of rules that found it.
    const at = f.places.find((p) => p.segmentId === segment.id && p.start === first.start)
    if (reason !== 'close' && at) return
    if (!at) {
      f.count++
      f.sessions.add(interview.sessionId)
      f.spellings.set(spelling, (f.spellings.get(spelling) ?? 0) + 1)
      if (f.places.length < PLACES_KEPT)
        f.places.push({
          sessionId: interview.sessionId,
          segmentId: segment.id,
          start: first.start,
          end: last.end,
        })
    }
  }

  // Unique words and phrases, to compare with the known spellings once each.
  const grams = new Map<string, { interview: Interview; segment: Segment; run: Token[] }[]>()
  for (const interview of input.interviews) {
    for (const segment of interview.segments) {
      const tokens = tokensOf(segment.text)
      // A name with a possessive or an elision ("Dana's", "d'Amélie") is still the name.
      const usable = (t: Token) =>
        !isNumber(t.text) &&
        ![t.folded, ...t.folded.replace(ELISION, '').replace(POSSESSIVE, '').split(/['-]/)].some(
          (part) => nameWords.has(part),
        )
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i] as Token
        if (!usable(t)) continue
        const acronym = isAcronym(t.text)
        if (acronym) add(interview, segment, [t], 'acronym')
        else if (
          t.text.length > 2 &&
          interview.language !== 'other' &&
          !commonWord(input.common, interview.language, t.folded)
        )
          add(interview, segment, [t], 'uncommon')
        // A run of capitalised words, one at least inside its sentence.
        if (isCapitalised(t.text) && (i === 0 || !isCapitalised(tokens[i - 1]?.text ?? ''))) {
          const run: Token[] = []
          for (let k = i; k < tokens.length && run.length < PHRASE_MAX; k++) {
            const w = tokens[k] as Token
            const last = run.at(-1)
            const repeated = run.some((r) => r.folded === w.folded)
            // A phrase is written in one go: only spaces between its words, none of one letter.
            const apart = last !== undefined && /\S/.test(segment.text.slice(last.end, w.start))
            if (!isCapitalised(w.text) || !usable(w) || repeated || apart || w.text.length < 2)
              break
            if (k > i && w.sentenceStart) break
            run.push(w)
          }
          const inside = run.some((w) => !w.sentenceStart)
          if (inside && (run.length > 1 || (run[0]?.text.length ?? 0) > 2))
            add(interview, segment, run, 'capitalised')
        }
        for (let n = 1; n <= 2 && i + n <= tokens.length; n++) {
          const run = tokens.slice(i, i + n)
          if (!run.every(usable)) break
          const folded = run.map((w) => w.folded).join(' ')
          const id = key(interview.language, folded)
          grams.set(id, [
            ...(grams.get(id) ?? []).slice(0, PLACES_KEPT - 1),
            { interview, segment, run },
          ])
        }
      }
    }
  }

  const closeTo = new Map<string, string>()
  for (const [id, places] of grams) {
    const first = places[0]
    if (!first || known.has(id)) continue
    const folded = first.run.map((w) => w.folded).join(' ')
    if (folded.length < 4) continue
    const term = (activeByLanguage.get(first.interview.language) ?? []).find((k) =>
      isClose(folded, fold(k.spelling)),
    )
    if (!term) continue
    closeTo.set(id, term.termId)
    for (const p of places) add(p.interview, p.segment, p.run, 'close')
  }

  // A common word written with a capital (a weekday in English) counts only when several
  // interviews write it so.
  for (const [id, f] of found) {
    const onlyCapital = f.reasons.size === 1 && f.reasons.has('capitalised')
    if (onlyCapital && !id.includes(' ') && f.sessions.size < 2) found.delete(id)
  }
  const all = [...found].map(([id, f]): Candidate => {
    const spelling = [...f.spellings].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    return {
      spelling,
      folded: fold(spelling),
      language: f.language,
      count: f.count,
      sessions: f.sessions.size,
      reasons: [...f.reasons].sort(),
      closeTo: closeTo.get(id) ?? null,
      places: f.places,
    }
  })
  // Never a spelling that holds a known name, whatever its form (FR-006).
  const safe = all.filter((c) => withPlaceholders(c.spelling, input.knownNames).text === c.spelling)
  const ranked = safe.sort(
    (a, b) =>
      Number(b.sessions >= 2) - Number(a.sessions >= 2) ||
      b.count - a.count ||
      a.folded.localeCompare(b.folded),
  )
  const close = ranked.filter((c) => c.closeTo !== null)
  const others = ranked.filter((c) => c.closeTo === null)
  const room = Math.max(0, CANDIDATE_LIMIT - close.length)
  const kept = new Set([...close, ...others.slice(0, room)])
  return {
    candidates: ranked.filter((c) => kept.has(c)),
    leftOut: ranked.length - kept.size,
  }
}
