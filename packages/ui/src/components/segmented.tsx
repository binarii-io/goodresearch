import { cn } from 'cn'
import type * as React from 'react'

/** A small group of toggle buttons where one is on (language switch). */
function Segmented({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return (
    <fieldset
      data-slot="segmented"
      className={cn('flex items-center gap-0.5 rounded-[10px] border bg-card p-[3px]', className)}
      {...props}
    />
  )
}

function SegmentedItem({
  className,
  pressed,
  ...props
}: Omit<React.ComponentProps<'button'>, 'aria-pressed'> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-slot="segmented-item"
      className={cn(
        'cursor-pointer rounded-[7px] px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground',
        className,
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
