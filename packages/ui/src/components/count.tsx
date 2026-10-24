import { cn } from 'cn'
import type * as React from 'react'

/** A number next to a section title ("Projects 12"). */
function Count({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="count"
      className={cn(
        'inline-grid h-6 min-w-7 place-items-center rounded-md border bg-muted px-1.5 text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** A section title with an optional count. */
function SectionTitle({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<'h2'> & { count?: number | undefined }) {
  return (
    <h2
      data-slot="section-title"
      className={cn('flex items-center gap-2.5 text-xl font-semibold', className)}
      {...props}
    >
      {children}
      {count === undefined ? null : <Count>{count}</Count>}
    </h2>
  )
}

export { Count, SectionTitle }
