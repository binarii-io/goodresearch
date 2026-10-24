import { useRender } from '@base-ui/react/use-render'
import { cn } from 'cn'
import { ArrowRightIcon, PlusIcon } from 'lucide-react'
import type * as React from 'react'
import { sky } from '../lib/sky.ts'

/**
 * A project as a card: a visual generated from its id, meta line, title. The title link covers
 * the whole card; `link` takes the router's link element.
 */
function ProjectCard({
  id,
  title,
  meta,
  footer,
  link,
  className,
}: {
  id: string
  title: string
  meta?: React.ReactNode
  footer?: React.ReactNode
  link: useRender.RenderProp
  className?: string
}) {
  const titleLink = useRender({
    defaultTagName: 'a',
    render: link,
    props: {
      className:
        'text-foreground outline-none focus-visible:shadow-none after:absolute after:inset-0 after:rounded-[22px] after:content-[""]',
      children: title,
    },
  })
  return (
    <article
      data-slot="project-card"
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[22px] bg-card shadow-card transition-shadow hover:shadow-card-hover has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-solid dark:border',
        className,
      )}
    >
      <div aria-hidden className="h-26" style={{ background: sky(id) }} />
      <div className="relative -mt-[30px] flex flex-1 flex-col rounded-tl-[22px] bg-card px-[18px] pt-[22px] pb-4">
        <span
          aria-hidden
          className="absolute -top-[28px] right-0 grid h-11 w-18 place-items-center rounded-tl-[14px] bg-card text-foreground before:absolute before:top-[14px] before:-left-[14px] before:size-[14px] before:bg-[radial-gradient(circle_at_0_0,transparent_13.5px,var(--card)_14px)] before:content-['']"
        >
          <ArrowRightIcon className="size-4" />
        </span>
        {meta ? (
          <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[0.82rem] text-muted-foreground">
            {meta}
          </p>
        ) : null}
        <h3 className="mb-4 text-[1.02rem] leading-snug font-bold tracking-tight break-words">
          {titleLink}
        </h3>
        {footer ? (
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** The last card of a grid, to create one more item. */
function NewCard({ className, children, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      data-slot="new-card"
      className={cn(
        'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border-[1.5px] border-dashed border-input text-muted-foreground hover:border-foreground hover:text-foreground',
        className,
      )}
      {...props}
    >
      <PlusIcon aria-hidden className="size-6" />
      {children}
    </button>
  )
}

export { NewCard, ProjectCard }
