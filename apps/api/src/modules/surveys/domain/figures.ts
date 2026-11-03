/** Spec 029: a base under this is flagged "small base". */
export const SMALL_BASE = 30
/** Under this base, shares are hidden: only counts are shown. */
export const SHARES_FROM = 5

export type FigureItem =
  | { readonly kind: 'single-choice' | 'multiple-choice'; readonly options: readonly string[] }
  | { readonly kind: 'likert'; readonly points: number }

/** What SQL counted for one item over the counted responses: respondents, and each value's count. */
export type ItemCounts = { readonly base: number; readonly values: ReadonlyMap<string, number> }

type Count = { readonly count: number; readonly percent: number | null }

export type Column = {
  readonly base: number
  readonly smallBase: boolean
  readonly options?: readonly ({ readonly value: string } & Count)[]
  readonly other?: Count
  readonly points?: readonly ({ readonly point: number } & Count)[]
  readonly mean?: number | null
  readonly median?: number | null
  readonly agree?: number | null
  readonly disagree?: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * One column of a figure (FR-003 to FR-005): shares over the respondents who answered the item, so
 * a multiple-choice item may exceed 100 %; values not among the options or points count as other.
 */
export const columnOf = (item: FigureItem, counts: ItemCounts): Column => {
  const { base } = counts
  const share = (n: number) => (base >= SHARES_FROM ? round1((100 * n) / base) : null)
  const count = (n: number): Count => ({ count: n, percent: share(n) })
  const of = (value: string) => counts.values.get(value) ?? 0
  const smallBase = base < SMALL_BASE
  if (item.kind !== 'likert') {
    const known = new Set(item.options)
    const other = [...counts.values].reduce((n, [v, c]) => n + (known.has(v) ? 0 : c), 0)
    return {
      base,
      smallBase,
      options: item.options.map((value) => ({ value, ...count(of(value)) })),
      other: count(other),
    }
  }
  const points = Array.from({ length: item.points }, (_, i) => i + 1)
  const perPoint = points.map((p) => of(String(p)))
  const answered = perPoint.reduce((n, c) => n + c, 0)
  const other = [...counts.values].reduce((n, [, c]) => n + c, 0) - answered
  const mean = answered ? round1(perPoint.reduce((n, c, i) => n + c * (i + 1), 0) / answered) : null
  // The median of the answered points: the middle one, or the middle of the two central ones.
  const at = (rank: number) => {
    let seen = 0
    for (const [i, c] of perPoint.entries()) {
      seen += c
      if (seen >= rank) return i + 1
    }
    return item.points
  }
  const median = answered
    ? (at(Math.floor((answered + 1) / 2)) + at(Math.ceil((answered + 1) / 2))) / 2
    : null
  const ends = (from: number) => perPoint.slice(from, from + 2).reduce((n, c) => n + c, 0)
  return {
    base,
    smallBase,
    points: points.map((point, i) => ({ point, ...count(perPoint[i] ?? 0) })),
    other: count(other),
    mean,
    median,
    agree: answered ? share(ends(item.points - 2)) : null,
    disagree: answered ? share(ends(0)) : null,
  }
}

/** FR-006: one column per option of the profiling item, in its order, empty ones included. */
export const crossColumns = (
  item: FigureItem,
  profileOptions: readonly string[],
  perOption: ReadonlyMap<string, ItemCounts>,
): (Column & { readonly option: string })[] =>
  profileOptions.map((option) => ({
    option,
    ...columnOf(item, perOption.get(option) ?? { base: 0, values: new Map() }),
  }))

export type FigureMeasure = 'option' | 'agree' | 'disagree' | 'mean'

/**
 * Spec 029 FR-010: the value a fact cites in a column, exact even where the screen hides the share
 * (a fact on a small base carries the flag); null when the column has nothing to cite.
 */
export const citedValue = (
  column: Column,
  ref: { readonly measure: FigureMeasure; readonly option?: string | undefined },
): { value: number; base: number; smallBase: boolean } | null => {
  const { base, smallBase } = column
  if (base === 0) return null
  const share = (n: number, of: number) => (of ? round1((100 * n) / of) : null)
  let value: number | null = null
  if (ref.measure === 'option') {
    const found = column.options?.find((o) => o.value === ref.option)
    value = found ? share(found.count, base) : null
  } else if (column.points) {
    const counts = column.points.map((p) => p.count)
    const ends = (from: number) => counts.slice(from, from + 2).reduce((n, c) => n + c, 0)
    // Over the respondents, as the screen shows it.
    value =
      ref.measure === 'mean'
        ? (column.mean ?? null)
        : share(ends(ref.measure === 'agree' ? counts.length - 2 : 0), base)
  }
  return value === null ? null : { value, base, smallBase }
}
