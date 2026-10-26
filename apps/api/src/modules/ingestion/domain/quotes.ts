import { normaliseWord } from './file-words.ts'

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

const WORD = /[\p{L}\p{N}]+/gu

type Token = { readonly start: number; readonly end: number; readonly key: string }

const tokens = (text: string): Token[] =>
  [...text.matchAll(WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    key: normaliseWord(m[0]),
  }))

/**
 * Research R4: under anonymisation, every name the app knows is replaced in the text sent to the AI
 * by a placeholder, the full name first, then each of its words of 3 letters or more (a first name
 * alone still names the person). Whole words only, ignoring case and accents.
 */
export const withPlaceholders = (
  text: string,
  names: readonly string[],
): { text: string; names: ReadonlyMap<string, string> } => {
  const people = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))]
  const placeholders = new Map<string, string>()
  const patterns: { words: string[]; placeholder: string }[] = []
  people.forEach((name, i) => {
    const placeholder = `[Person ${i + 1}]`
    placeholders.set(placeholder, name)
    const words = tokens(name).map((t) => t.key)
    if (words.length) patterns.push({ words, placeholder })
    for (const w of words) if (w.length >= 3) patterns.push({ words: [w], placeholder })
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
  return { text: out + text.slice(at), names: placeholders }
}

/** The AI's answer with the placeholders turned back into the names (they stay in the app). */
export const fromPlaceholders = (text: string, names: ReadonlyMap<string, string>): string =>
  text.replace(/\[Person \d+\]/g, (p) => names.get(p) ?? p)
