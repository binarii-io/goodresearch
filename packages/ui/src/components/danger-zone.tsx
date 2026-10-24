import { cn } from 'cn'
import type * as React from 'react'

/** Destructive actions of a page, grouped at its bottom (spec 003, FR-012). */
function DangerZone({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      data-slot="danger-zone"
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[color-mix(in_srgb,var(--destructive)_30%,var(--border))] bg-card p-5',
        className,
      )}
    >
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export { DangerZone }
