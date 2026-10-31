import { cn } from 'cn'
import type * as React from 'react'

/**
 * One headline number with its label and a short detail ("Interviews found · 12 · 9 validated").
 * A list of tiles is a `<dl>`: each tile is a group of a term and its value. On wide screens all
 * tiles share one row, whatever their number.
 */
function StatTiles({ className, ...props }: React.ComponentProps<'dl'>) {
  return (
    <dl
      data-slot="stat-tiles"
      className={cn('grid grid-cols-2 gap-3 lg:auto-cols-fr lg:grid-flow-col', className)}
      {...props}
    />
  )
}

function StatTile({
  className,
  label,
  value,
  detail,
  icon,
  hint,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  label: React.ReactNode
  value: React.ReactNode
  detail?: React.ReactNode
  /** Decorative: the label names the tile. */
  icon?: React.ReactNode
  /** A help button, at the top right of the tile. */
  hint?: React.ReactNode
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn('relative grid content-start gap-1 rounded-lg border bg-card p-4', className)}
      {...props}
    >
      <dt
        className={cn(
          'flex items-center gap-1.5 text-muted-foreground text-sm [&>svg]:size-4',
          hint && 'pr-5',
        )}
      >
        {/* A list group holds only terms and values: placed from the tile, written in the term. */}
        {hint ? <span className="absolute top-2 right-2">{hint}</span> : null}
        {icon}
        {label}
      </dt>
      <dd className="font-semibold text-3xl">{value}</dd>
      {detail ? <dd className="text-muted-foreground text-xs">{detail}</dd> : null}
    </div>
  )
}

export { StatTile, StatTiles }
