import type { Figure, FigureColumn } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@goodresearch/ui/components/table'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'

/** A share as text, "62.5 %", or the count alone under a base of 5 (spec 029 FR-005). */
export function useShare() {
  const { i18n } = useLingui()
  return (percent: number | null | undefined, count?: number) =>
    percent === null || percent === undefined
      ? count === undefined
        ? '—'
        : i18n.number(count)
      : `${i18n.number(percent, { maximumFractionDigits: 1 })} %`
}

/** One labelled bar: the length is decoration, the numbers are in the text. */
function Bar({ label, percent, text }: { label: ReactNode; percent: number | null; text: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="truncate" title={typeof label === 'string' ? label : undefined}>
        {label}
      </span>
      <span aria-hidden className="h-2.5 rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, percent ?? 0)}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-right tabular-nums">{text}</span>
    </li>
  )
}

/** A figure in the flat sort: bars with counts and shares, and a scale's measures. */
function FlatSort({ figure }: { figure: Figure }) {
  const { t, i18n } = useLingui()
  const share = useShare()
  const c = figure.total
  // The bar's length is decoration: it follows the count even where the share is hidden (base < 5).
  const fill = (count: number) => (c.base ? (100 * count) / c.base : 0)
  const line = (count: number, percent: number | null) =>
    percent === null ? i18n.number(count) : `${share(percent)} (${i18n.number(count)})`
  return (
    <>
      <ul className="grid gap-1.5">
        {c.options?.map((o) => (
          <Bar
            key={o.value}
            label={o.value}
            percent={fill(o.count)}
            text={line(o.count, o.percent)}
          />
        ))}
        {c.points?.map((p) => (
          <Bar
            key={p.point}
            label={
              p.point === 1 && figure.lowLabel
                ? `1 · ${figure.lowLabel}`
                : p.point === figure.points && figure.highLabel
                  ? `${p.point} · ${figure.highLabel}`
                  : String(p.point)
            }
            percent={fill(p.count)}
            text={line(p.count, p.percent)}
          />
        ))}
        {c.other && c.other.count > 0 ? (
          <Bar
            label={<span className="text-muted-foreground">{t`Other answers`}</span>}
            percent={fill(c.other.count)}
            text={line(c.other.count, c.other.percent)}
          />
        ) : null}
      </ul>
      {figure.kind === 'likert' && c.mean !== null && c.mean !== undefined ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>{t`Mean: ${i18n.number(c.mean, { maximumFractionDigits: 1 })}`}</span>
          <span>{t`Median: ${i18n.number(c.median ?? 0, { maximumFractionDigits: 1 })}`}</span>
          <span>{t`Agreement: ${share(c.agree)}`}</span>
          <span>{t`Disagreement: ${share(c.disagree)}`}</span>
        </p>
      ) : null}
    </>
  )
}

/** Each option or measure per column of the cross, with each column's base. */
function CrossTable({ figure }: { figure: Figure }) {
  const { t, i18n } = useLingui()
  const share = useShare()
  const columns: (FigureColumn & { option: string | null })[] = [
    { ...figure.total, option: null },
    ...(figure.columns ?? []),
  ]
  const cell = (count: number, percent: number | null) =>
    percent === null ? i18n.number(count) : `${share(percent)} (${i18n.number(count)})`
  const rows: { label: string; value: (c: FigureColumn) => string }[] = [
    ...(figure.total.options ?? []).map((o, i) => ({
      label: o.value,
      value: (c: FigureColumn) => {
        const x = c.options?.[i]
        return x ? cell(x.count, x.percent) : '—'
      },
    })),
    ...(figure.kind === 'likert'
      ? [
          {
            label: t`Mean`,
            value: (c: FigureColumn) =>
              c.mean === null || c.mean === undefined
                ? '—'
                : i18n.number(c.mean, { maximumFractionDigits: 1 }),
          },
          { label: t`Agreement`, value: (c: FigureColumn) => share(c.agree) },
          { label: t`Disagreement`, value: (c: FigureColumn) => share(c.disagree) },
        ]
      : []),
  ]
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">{t`Answer`}</span>
            </TableHead>
            {columns.map((c) => (
              <TableHead key={c.option ?? ''} className="text-right">
                <span className="grid">
                  <span>{c.option ?? t`Total`}</span>
                  <span className="font-normal text-muted-foreground text-xs">
                    {c.smallBase ? t`Base ${c.base}, small` : t`Base ${c.base}`}
                  </span>
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="font-medium">{r.label}</TableCell>
              {columns.map((c) => (
                <TableCell key={c.option ?? ''} className="text-right tabular-nums">
                  {r.value(c)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** One item's figure (spec 029 US1, US2). */
export function FigureCard({
  figure,
  footer,
}: {
  figure: Figure
  /** Spec 029 US4: what a person can do with the figure (make a fact of it). */
  footer?: ReactNode
}) {
  const { t } = useLingui()
  const base = figure.total.base
  return (
    <article className="grid content-start gap-3 rounded-lg border bg-card p-4">
      <header className="grid gap-1">
        <h4 className="font-medium">{figure.text}</h4>
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>{t`Base: ${base} respondents`}</span>
          {figure.total.smallBase ? <Badge variant="highlight">{t`Small base`}</Badge> : null}
          {figure.multiple ? (
            <span>{t`Several answers each: shares may exceed 100 %.`}</span>
          ) : null}
          {figure.formerWording ? (
            <span>{t`${figure.formerWording} answered a former wording.`}</span>
          ) : null}
        </p>
      </header>
      {figure.columns ? <CrossTable figure={figure} /> : <FlatSort figure={figure} />}
      {footer}
    </article>
  )
}
