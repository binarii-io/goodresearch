type Tally = {
  readonly count: number
  readonly yes: number
  readonly no: number
  readonly unsure: number
}

type Interview = Tally & {
  readonly quotes: readonly { readonly spelling: string }[]
  /** Absent: the counts per spelling are not known, the interview is kept as it is. */
  readonly spellings?: readonly (Tally & { readonly spelling: string })[] | undefined
}

/**
 * Spec 033: a term's occurrences as the spellings switched on take them into account. An interview
 * keeps the places, counts and verdicts of its kept spellings and goes when none is left. The
 * term's form is always kept. Spellings compare as written: they are the term's own, and the match
 * rule tells an acronym from a word by its case.
 */
export const keptOccurrences = <T extends Interview>(
  interviews: readonly T[],
  form: string,
  kept: readonly string[],
): T[] => {
  const on = new Set([form, ...kept])
  return interviews.flatMap((o) => {
    if (!o.spellings) return [o]
    const mine = o.spellings.filter((s) => on.has(s.spelling))
    const sum = (key: keyof Tally) => mine.reduce((a, s) => a + s[key], 0)
    const count = sum('count')
    if (count === 0) return []
    if (mine.length === o.spellings.length) return [o]
    return [
      {
        ...o,
        count,
        yes: sum('yes'),
        no: sum('no'),
        unsure: sum('unsure'),
        quotes: o.quotes.filter((q) => on.has(q.spelling)),
      },
    ]
  })
}
