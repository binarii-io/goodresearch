import type { Column } from '../../domain/figures.ts'

type View = {
  readonly counts: { readonly counted: number; readonly setAside: number }
  readonly crossBy: string | null
  readonly crossable: readonly { readonly id: string; readonly text: string }[]
  readonly sections: readonly {
    readonly title: string
    readonly figures: readonly {
      readonly itemId: string
      readonly text: string
      readonly kind: string
      readonly multiple: boolean
      readonly total: Column
      readonly columns: readonly (Column & { readonly option: string })[] | null
    }[]
  }[]
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? 'hidden' : `${n} %`)

const column = (c: Column) => {
  const base = `base ${c.base}${c.smallBase ? ' (small)' : ''}`
  if (c.points)
    return `${base}; mean ${c.mean ?? '-'}, median ${c.median ?? '-'}, agree ${pct(c.agree)}, disagree ${pct(c.disagree)}`
  const options = (c.options ?? []).map((o) => `"${o.value}" ${pct(o.percent)} (${o.count})`)
  return `${base}; ${[...options, ...(c.other?.count ? [`other ${c.other.count}`] : [])].join(', ')}`
}

/**
 * Spec 029 FR-014: the figures computed by the app, as the assistant reads them: item ids, texts,
 * counts and shares; never an answer of a response.
 */
export const figuresText = (v: View): string =>
  [
    `Counted responses: ${v.counts.counted}; set aside: ${v.counts.setAside}.`,
    `Profiling items to cross by: ${v.crossable.map((c) => `${c.id} "${c.text}"`).join('; ') || 'none'}.`,
    ...v.sections.flatMap((s) => [
      `## ${s.title}`,
      ...s.figures.map((f) =>
        [
          `- ${f.itemId} "${f.text}" (${f.kind}${f.multiple ? ', several answers each' : ''}): ${column(f.total)}`,
          ...(f.columns ?? []).map((c) => `  - among "${c.option}": ${column(c)}`),
        ].join('\n'),
      ),
    ]),
  ].join('\n')
