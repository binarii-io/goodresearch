import { cn } from 'cn'
import { TriangleAlertIcon } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef } from 'react'

/*
 * The pieces of a 16:9 slide (spec 015, the debrief deck). Sizes are in `cqw`: a slide sets
 * `container-type: inline-size`, so the same slide reads alike as a thumbnail, in the page, full
 * screen and printed.
 */

/**
 * Shrinks a slide's body that runs over, down to 60%. It is scaled as a picture (`transform`), not
 * with `zoom`, which shifts the glyphs around punctuation; refitted when the slide is resized.
 */
export function useSlideFit(deps: unknown) {
  const frame = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const fit = () => {
      const f = frame.current
      const b = inner.current
      if (!f || !b || f.clientWidth === 0) return
      let scale = 1
      const apply = () => {
        b.style.transform = scale === 1 ? '' : `scale(${scale})`
        b.style.width = `${f.clientWidth / scale}px`
        b.style.height = `${f.clientHeight / scale}px`
      }
      apply()
      while (b.scrollHeight > b.clientHeight + 1 && scale > 0.6) {
        scale = Math.round((scale - 0.05) * 100) / 100
        apply()
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    if (frame.current) observer.observe(frame.current)
    return () => observer.disconnect()
  }, [deps])
  return { frame, inner }
}

/** A warning in words on the highlighter (e.g. "To validate"): never a colour alone. */
function SlideFlag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.4cqw] whitespace-nowrap rounded-full bg-highlight-soft px-[0.8cqw] py-[0.15cqw] font-medium text-[1cqw] text-highlight-soft-foreground not-italic',
        className,
      )}
    >
      <TriangleAlertIcon aria-hidden className="size-[1.1cqw]" />
      {children}
    </span>
  )
}

/** A small label in a pill; `strong` fills it with ink. */
function SlidePill({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-full border px-[0.8cqw] py-[0.15cqw] text-[1cqw]',
        strong && 'border-transparent bg-primary text-primary-foreground',
      )}
    >
      {children}
    </span>
  )
}

/** A figure in large type, its label under it; `mark` underlines it with the highlighter. */
function SlideStat({
  value,
  label,
  mark = false,
}: {
  value: number
  label: string
  mark?: boolean
}) {
  return (
    <div className="flex flex-col">
      <strong
        className={cn(
          'self-start font-bold text-[10cqw] leading-none tracking-tight',
          mark && 'shadow-[inset_0_-0.25em_0_var(--highlight)]',
        )}
      >
        {value}
      </strong>
      <span className="mt-[1cqw] text-[2cqw] text-muted-foreground">{label}</span>
    </div>
  )
}

/** A section's small capitals above its content. */
function SlideLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-[0.6cqw] font-bold text-[1.1cqw] text-muted-foreground uppercase tracking-widest">
      {children}
    </p>
  )
}

/**
 * A table of a slide. Proportional figures: tabular ones widen the punctuation of this typeface.
 */
function SlideTable({ head, rows }: { head: readonly string[]; rows: readonly ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-[1.3cqw] [font-variant-numeric:normal]">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              scope="col"
              className="border-foreground border-b-2 px-[0.8cqw] py-[0.6cqw] text-left font-semibold text-[1cqw] text-muted-foreground uppercase tracking-wider"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} className="border-b px-[0.8cqw] py-[0.7cqw] align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export { SlideFlag, SlideLabel, SlidePill, SlideStat, SlideTable }
