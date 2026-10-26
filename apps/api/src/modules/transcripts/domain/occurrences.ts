import { findMatches, fold, isAcronym, words } from '@goodresearch/shared'
import type { Interview } from './candidates.ts'
import { countedSpellings, type LexiconTerm } from './lexicon-term.ts'

/** Where one occurrence is: its turn, its start and its length in the turn's text. */
export type Anchor = {
  readonly segmentId: string
  readonly offset: number
  readonly length?: number
}

export type Occurrence = {
  readonly termId: string
  readonly spelling: string
  readonly sessionId: string
  readonly count: number
  /** Up to 50, for the quotes shown. */
  readonly anchors: readonly Anchor[]
}

/** Places kept per spelling and interview; the count goes on beyond. */
export const ANCHORS_KEPT = 50

type Indexed = { readonly text: string; readonly start: number; readonly folded: string }

/**
 * Research R6: the occurrences of every counted spelling of the terms in each interview of their
 * language, with the lexicon match rule of `@goodresearch/shared` (`findMatches`): whole words,
 * acronyms case-sensitive. Words are indexed once per interview.
 */
export const countOccurrences = (
  interviews: readonly Interview[],
  terms: readonly LexiconTerm[],
  /** Places kept per spelling and interview. */
  kept = ANCHORS_KEPT,
): Occurrence[] => {
  const out: Occurrence[] = []
  for (const interview of interviews) {
    const segments = interview.segments.map((s) => {
      const all = words(s.text).map((w) => ({ text: w.text, start: w.start, folded: fold(w.text) }))
      const byWord = new Map<string, number[]>()
      all.forEach((w, i) => {
        const at = byWord.get(w.folded)
        if (at) at.push(i)
        else byWord.set(w.folded, [i])
      })
      return { id: s.id, all, byWord }
    })
    for (const term of terms) {
      if (term.language !== interview.language) continue
      // Every match of every spelling, then one per place: where spellings overlap ("Acme Cloud"
      // and "Acme"), the longest wins (review of PR #10).
      const matches: { spelling: string; seg: number; word: number; words: number }[] = []
      for (const spelling of countedSpellings(term)) {
        const wanted = words(spelling).map((w) => w.text)
        const first = wanted[0]
        if (!first) continue
        const same = (w: string, found: Indexed | undefined) =>
          found !== undefined && (isAcronym(w) ? w === found.text : fold(w) === found.folded)
        segments.forEach((s, seg) => {
          let after = -1
          for (const i of s.byWord.get(fold(first)) ?? []) {
            if (i <= after || !wanted.every((w, k) => same(w, s.all[i + k]))) continue
            after = i + wanted.length - 1
            matches.push({ spelling, seg, word: i, words: wanted.length })
          }
        })
      }
      matches.sort((a, b) => a.seg - b.seg || a.word - b.word || b.words - a.words)
      const bySpelling = new Map<string, { count: number; anchors: Anchor[] }>()
      let last: (typeof matches)[number] | undefined
      for (const m of matches) {
        if (last && last.seg === m.seg && m.word < last.word + last.words) continue
        last = m
        const s = segments[m.seg]
        const startWord = s?.all[m.word]
        const endWord = s?.all[m.word + m.words - 1]
        if (!s || !startWord || !endWord) continue
        const row = bySpelling.get(m.spelling) ?? { count: 0, anchors: [] }
        row.count++
        if (row.anchors.length < kept)
          row.anchors.push({
            segmentId: s.id,
            offset: startWord.start,
            length: endWord.start + endWord.text.length - startWord.start,
          })
        bySpelling.set(m.spelling, row)
      }
      for (const [spelling, row] of bySpelling)
        out.push({ termId: term.id, spelling, sessionId: interview.sessionId, ...row })
    }
  }
  return out
}

/** Spec 010: a person's yes / no on one occurrence of a term, kept across readings. */
export type Verdict = {
  readonly termId: string
  readonly sessionId: string
  readonly segmentId: string
  readonly offset: number
  readonly verdict: 'yes' | 'no'
  readonly decidedBy: string
  readonly decidedAt: Date
}

/** Whether one of the term's counted spellings is written at this place of the turn. */
export const occurrenceAt = (term: LexiconTerm, text: string, offset: number): boolean =>
  countedSpellings(term).some((spelling) => findMatches(text, spelling).includes(offset))
