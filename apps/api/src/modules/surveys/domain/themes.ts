import { nameKey, QUOTE_MAX, quoteFound } from '@goodresearch/shared'

/** Spec 029 research R6: answers sent per call. */
export const PART_SIZE = 150
/** Under this many counted answers, an open item is listed, not themed. */
export const MIN_ANSWERS = 5

type Bilingual = { readonly en: string; readonly fr: string }

/** A masked answer as sent: a number local to the run, never the response's id. */
export type SentAnswer = {
  readonly number: number
  readonly sourceId: string
  readonly text: string
}

/** A theme as the AI proposes it (answer numbers and excerpts, never trusted). */
export type ProposedTheme = {
  readonly label: Bilingual
  readonly description: Bilingual
  readonly answers: readonly { readonly n: number; readonly quote: string | null }[]
  /** On a run over new answers: the id of an existing theme they join. */
  readonly existing: string | null
}

/** A theme the app kept: the responses it holds, each with its verified quote, if any. */
export type CheckedTheme = {
  readonly label: Bilingual
  readonly description: Bilingual
  readonly answers: readonly { readonly sourceId: string; readonly quote: string | null }[]
  readonly existing: string | null
}

/** Numbers every answer of the run, then cuts them in parts (research R6). */
export const partsOf = (
  answers: readonly { readonly sourceId: string; readonly text: string }[],
): SentAnswer[][] => {
  const numbered = answers.map((a, i) => ({ number: i + 1, sourceId: a.sourceId, text: a.text }))
  const parts: SentAnswer[][] = []
  for (let i = 0; i < numbered.length; i += PART_SIZE) parts.push(numbered.slice(i, i + PART_SIZE))
  return parts
}

/**
 * FR-008, FR-009: an answer counts only if it was sent; a quote only if found word for word in it;
 * a theme without an answer left, or one a person rejected before, is dropped; an answer goes to
 * the first theme citing it.
 */
export const checkThemes = (
  proposed: readonly ProposedTheme[],
  sent: readonly SentAnswer[],
  rejectedLabels: readonly string[],
) => {
  const byNumber = new Map(sent.map((a) => [a.number, a]))
  const rejected = new Set(rejectedLabels.map(nameKey))
  const taken = new Set<string>()
  let droppedQuotes = 0
  let droppedThemes = 0
  const themes: CheckedTheme[] = []
  for (const t of proposed) {
    if (rejected.has(nameKey(t.label.en)) || rejected.has(nameKey(t.label.fr))) {
      droppedThemes++
      continue
    }
    const answers: { sourceId: string; quote: string | null }[] = []
    for (const a of t.answers) {
      const answer = byNumber.get(a.n)
      if (!answer) {
        if (a.quote) droppedQuotes++
        continue
      }
      if (taken.has(answer.sourceId)) continue
      taken.add(answer.sourceId)
      const quote = a.quote?.trim().slice(0, QUOTE_MAX) ?? null
      const found = quote !== null && quote.length > 0 && quoteFound(answer.text, quote)
      if (quote && !found) droppedQuotes++
      answers.push({ sourceId: answer.sourceId, quote: found ? quote : null })
    }
    if (answers.length === 0) {
      droppedThemes++
      continue
    }
    themes.push({ label: t.label, description: t.description, answers, existing: t.existing })
  }
  return { themes, droppedQuotes, droppedThemes }
}

/**
 * Research R6: with several parts, the AI sees only `t1…tN` labels and returns which to merge;
 * the app applies it, keeping the first theme's texts. Unknown refs are ignored.
 */
export const mergeThemes = (
  themes: readonly CheckedTheme[],
  merges: readonly { readonly keep: string; readonly merge: readonly string[] }[],
): CheckedTheme[] => {
  const index = (ref: string) => {
    const n = Number(ref.replace(/^t/, '')) - 1
    return Number.isInteger(n) && n >= 0 && n < themes.length ? n : null
  }
  const into = new Map<number, number>()
  for (const m of merges) {
    const keep = index(m.keep)
    if (keep === null || into.has(keep)) continue
    for (const ref of m.merge) {
      const from = index(ref)
      if (from !== null && from !== keep && !into.has(from)) into.set(from, keep)
    }
  }
  return themes.flatMap((t, i) => {
    if (into.has(i)) return []
    const extra = themes.flatMap((x, j) => (into.get(j) === i ? x.answers : []))
    return [{ ...t, answers: [...t.answers, ...extra] }]
  })
}
