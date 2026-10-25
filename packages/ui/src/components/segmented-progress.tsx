import { cn } from 'cn'
import type * as React from 'react'

export type ProgressSegment = {
  readonly key: string
  readonly label: string
  readonly weight: number
  readonly status: 'missing' | 'partial' | 'done'
  /** The status in words, for the list ("covered", "partial", "missing"). */
  readonly statusLabel: string
}

/**
 * Progress made of weighted points (a guide design checklist): one segment per point, as wide as
 * its weight, filled when done and half filled when partial. The percentage is given by the
 * caller; the points and their states are listed in a disclosure for screen readers and focus.
 */
function SegmentedProgress({
  label,
  percent,
  segments,
  listLabel,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  label: string
  percent: number
  segments: readonly ProgressSegment[]
  /** Summary of the disclosure ("8 points"). */
  listLabel: string
}) {
  return (
    <div data-slot="segmented-progress" className={cn('grid gap-1.5', className)} {...props}>
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="flex h-2 flex-1 gap-0.5"
        >
          {segments.map((s) => (
            <span
              key={s.key}
              title={`${s.label} · ${s.statusLabel}`}
              style={{ flexGrow: s.weight }}
              className="relative basis-0 overflow-hidden rounded-full bg-muted"
            >
              <span
                className={cn(
                  'absolute inset-y-0 left-0 bg-highlight',
                  s.status === 'done' ? 'w-full' : s.status === 'partial' ? 'w-1/2' : 'w-0',
                )}
              />
            </span>
          ))}
        </div>
        <span className="min-w-10 text-right font-medium text-sm tabular-nums">{percent} %</span>
      </div>
      <details className="group text-xs">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          {listLabel}
        </summary>
        <ul className="mt-1.5 grid gap-1">
          {segments.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'size-2.5 shrink-0 rounded-full border border-foreground/40',
                  s.status === 'done' && 'border-transparent bg-highlight',
                  s.status === 'partial' &&
                    'bg-[linear-gradient(90deg,var(--highlight)_50%,transparent_50%)]',
                )}
              />
              <span className="flex-1">{s.label}</span>
              <span className="text-muted-foreground">
                {s.statusLabel} · {s.weight} %
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export { SegmentedProgress }
