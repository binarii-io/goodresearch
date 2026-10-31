import { cn } from 'cn'
import type * as React from 'react'

/** How far a run has gone, next to its words; the caller names it with `aria-label`. */
function Progress({
  value,
  max,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-1.5 w-24 overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export { Progress }
