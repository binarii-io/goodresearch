// Text rules shared by the API modules and the web app (specs 009 and 010): the same quote check,
// name placeholders and lexicon match rule everywhere.

const withoutMarks = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Lower case, without accents and with straight apostrophes: what words are compared on. */
export const fold = (text: string): string => withoutMarks(text).replace(/[‘’ʼ`´]/g, "'")

/** The same person whatever the case, accents or spaces of their name (stored keys, spec 009). */
export const nameKey = (name: string): string => withoutMarks(name).replace(/\s+/g, ' ').trim()

/**
 * The person in a label written by a meeting tool: what comes before " -", "(", "|" or "[" (a
 * company, a place, a version). "Jean-Pierre" keeps its hyphen.
 */
export const personName = (label: string): string =>
  (label.split(/\s+[-–]|\s*[(|[]/)[0] ?? '').trim()

/** What a meeting tool writes at the end of a transcript, followed by a duration: not a speaker. */
export const isTranscriptEnd = (label: string): boolean =>
  /^(transcription terminee apres|transcription ended after)$/.test(
    fold(label).trim().replace(/\s+/g, ' '),
  )

export type Word = { readonly text: string; readonly start: number; readonly end: number }

const WORD = /[\p{L}\p{N}]+(?:['‘’ʼ-][\p{L}\p{N}]+)*/gu

/** The words of a text with their offsets; apostrophes and hyphens inside a word belong to it. */
export const words = (text: string): Word[] =>
  [...text.matchAll(WORD)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }))

/** 2 to 6 capital letters, digits allowed (`NPS`, `B2B`). */
export const isAcronym = (word: string): boolean =>
  /^[\p{Lu}\p{N}]{2,6}$/u.test(word) && (word.match(/\p{Lu}/gu)?.length ?? 0) >= 2

const sameWord = (wanted: string, found: string) =>
  isAcronym(wanted) ? wanted === found : fold(wanted) === fold(found)

/**
 * Context map, LexiconTerm match rule: whole words or phrases; acronyms case-sensitive, other words
 * case- and accent-insensitive. Returns the start offset of each match.
 */
export const findMatches = (text: string, spelling: string): number[] => {
  const wanted = words(spelling).map((w) => w.text)
  if (wanted.length === 0) return []
  const all = words(text)
  const starts: number[] = []
  for (let i = 0; i + wanted.length <= all.length; i++) {
    if (wanted.every((w, k) => sameWord(w, all[i + k]?.text ?? ''))) {
      starts.push(all[i]?.start ?? 0)
      i += wanted.length - 1
    }
  }
  return starts
}

/** Longest quote kept from an AI answer (spec 009 FR-005). */
export const QUOTE_MAX = 300

/** Case, spaces and apostrophe or quote style do not count when a quote is checked. */
export const normaliseQuote = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Constitution IV: an AI quote is kept only when the text sent holds it. */
export const quoteFound = (text: string, quote: string): boolean => {
  const q = normaliseQuote(quote)
  return q.length > 0 && quote.length <= QUOTE_MAX && normaliseQuote(text).includes(q)
}

const NAME_WORD = /[\p{L}\p{N}]+/gu

type Token = { readonly start: number; readonly end: number; readonly key: string }

const tokens = (text: string): Token[] =>
  [...text.matchAll(NAME_WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    key: fold(m[0]),
  }))

/** A placeholder put in place of a name; `[Person 1]`… */
export const PLACEHOLDER = /\[Person \d+\]/g

/**
 * Every name the app knows is replaced in a text sent to the AI by a placeholder, the full name
 * first, then each of its words of 3 letters or more (a first name alone still names the person).
 * Whole words only, ignoring case and accents.
 */
export const withPlaceholders = (
  text: string,
  names: readonly string[],
): {
  text: string
  names: ReadonlyMap<string, string>
  /** Where each placeholder went, in the text given: to map offsets back (spec 011). */
  cuts: readonly { start: number; end: number; placeholder: string }[]
} => {
  const people = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))]
  const placeholders = new Map<string, string>()
  const patterns: { words: string[]; placeholder: string }[] = []
  people.forEach((name, i) => {
    const placeholder = `[Person ${i + 1}]`
    placeholders.set(placeholder, name)
    const nameWords = tokens(name).map((t) => t.key)
    if (nameWords.length) patterns.push({ words: nameWords, placeholder })
    for (const w of nameWords) if (w.length >= 3) patterns.push({ words: [w], placeholder })
  })
  // Longest patterns first: "Sam Example" before "Sam".
  patterns.sort((a, b) => b.words.length - a.words.length)
  const all = tokens(text)
  const cuts: { start: number; end: number; placeholder: string }[] = []
  for (let i = 0; i < all.length; ) {
    const hit = patterns.find((p) => p.words.every((w, k) => all[i + k]?.key === w))
    if (!hit) {
      i++
      continue
    }
    const first = all[i]
    const last = all[i + hit.words.length - 1]
    if (first && last)
      cuts.push({ start: first.start, end: last.end, placeholder: hit.placeholder })
    i += hit.words.length
  }
  let out = ''
  let at = 0
  for (const c of cuts) {
    out += text.slice(at, c.start) + c.placeholder
    at = c.end
  }
  return { text: out + text.slice(at), names: placeholders, cuts }
}

/** The AI's answer with the placeholders turned back into the names (they stay in the app). */
export const fromPlaceholders = (text: string, names: ReadonlyMap<string, string>): string =>
  text.replace(PLACEHOLDER, (p) => names.get(p) ?? p)

// Spec 009 research R3: the language of an interview from its common words.

export type SessionLanguage = 'en' | 'fr' | 'other'

// Short, frequent words; accents removed (fold).
const EN = new Set(
  'the and you that what this with have for are was not but they about think there would could so do it is we'.split(
    ' ',
  ),
)
const FR = new Set(
  'le la les des est que qui pas vous nous une pour dans avec sur alors mais cest tres aussi ca on je tu il elle de du en et'.split(
    ' ',
  ),
)

/** Research R3: the language with at least twice the other's common words, else `other`. */
export const languageOf = (text: string): SessionLanguage => {
  let en = 0
  let fr = 0
  for (const m of text.matchAll(/[\p{L}']+/gu)) {
    for (const part of fold(m[0]).split("'")) {
      if (EN.has(part)) en++
      if (FR.has(part)) fr++
    }
  }
  if (en >= 3 && en >= 2 * fr) return 'en'
  if (fr >= 3 && fr >= 2 * en) return 'fr'
  return 'other'
}

const keysOf = (text: string) => words(text).map((w) => fold(w.text))

/**
 * The share of the first text's words (3 letters or more) that the second holds, ignoring case
 * and accents: a statement sharing most of its words with a decided one says the same thing.
 */
export const sharedWords = (text: string, other: string): number => {
  const mine = [...new Set(keysOf(text).filter((k) => k.length >= 3))]
  if (mine.length === 0) return 0
  const theirs = new Set(keysOf(other))
  return mine.filter((k) => theirs.has(k)).length / mine.length
}

/** A known person's name, a word of it (3 letters or more), or a placeholder. */
export const holdsName = (text: string, names: readonly string[]): boolean => {
  if (new RegExp(PLACEHOLDER.source).test(text)) return true
  const keys = new Set(keysOf(text))
  return names.some((name) => {
    const nameKeys = keysOf(name)
    return nameKeys.length > 0 && nameKeys.some((k) => k.length >= 3 && keys.has(k))
  })
}
