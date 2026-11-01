import { useRender } from '@base-ui/react/use-render'
import { cn } from 'cn'
import type * as React from 'react'
import { Progress } from './progress'

/** The chained steps of a piece of work, in order (spec 017); each one is a link. */
function JourneySteps({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="journey-steps"
      className={cn('grid gap-3 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col', className)}
      {...props}
    />
  )
}

function JourneyStep({
  number,
  label,
  value,
  detail,
  next,
  action,
  progress,
  dimmed = false,
  render,
}: {
  number: number
  label: React.ReactNode
  /** The volume, or an icon for a step without one. */
  value: React.ReactNode
  /** What the step holds; shown under `action` on the next step. */
  detail?: React.ReactNode
  /** The words marking the next step: never colour alone. */
  next?: React.ReactNode
  action?: React.ReactNode
  /** Its accessible name comes from `label`. */
  progress?: { value: number; max: number; label: string } | undefined
  /** Nothing here yet. */
  dimmed?: boolean
  /** The router's link. */
  render: useRender.RenderProp
}) {
  const link = useRender({
    defaultTagName: 'a',
    render,
    props: {
      className: cn(
        'relative grid h-full content-start gap-1 rounded-lg border bg-card px-4 pt-3.5 pb-4 text-foreground transition-shadow hover:shadow-card-hover',
        next && 'border-highlight ring-3 ring-highlight-soft',
      ),
      children: (
        <>
          <span className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full bg-muted text-foreground',
                next && 'bg-highlight text-[var(--ink)]',
              )}
            >
              {number}
            </span>
            {label}
          </span>
          <strong
            className={cn(
              'flex min-h-9 items-center font-bold text-3xl tabular-nums tracking-tight',
              dimmed && 'text-muted-foreground',
            )}
          >
            {value}
          </strong>
          {next ? (
            <span className="w-fit rounded-full bg-highlight px-2 py-0.5 font-semibold text-[var(--ink)] text-xs">
              {next}
            </span>
          ) : null}
          {action ? <span className="font-medium text-sm">{action}</span> : null}
          {detail ? <span className="text-muted-foreground text-sm">{detail}</span> : null}
          {progress ? (
            <Progress
              aria-label={progress.label}
              value={progress.value}
              max={progress.max}
              className="mt-1.5 h-1 w-full"
            />
          ) : null}
        </>
      ),
    },
  })
  return (
    <li data-slot="journey-step" className="group/step relative">
      {link}
      <span
        aria-hidden
        className="absolute top-1/2 -right-3 z-10 hidden size-[18px] -translate-y-1/2 place-items-center rounded-full bg-border text-muted-foreground text-xs lg:grid lg:group-last/step:hidden"
      >
        ›
      </span>
    </li>
  )
}

export { JourneyStep, JourneySteps }
