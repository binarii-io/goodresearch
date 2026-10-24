import { useRender } from '@base-ui/react/use-render'
import { cn } from 'cn'
import { ArrowLeftIcon } from 'lucide-react'
import * as React from 'react'

/**
 * Bar at the top of a page, across the whole content column (spec 003, FR-012): square back
 * button, title as a breadcrumb (parents greyed and clickable, current page in bold), controls on
 * the right (tabs, phases, folder). `back` takes the router's link.
 */
function PageBar({
  back,
  backLabel,
  crumbs,
  title,
  right,
  className,
}: {
  back?: useRender.RenderProp
  backLabel?: string
  /** Parent pages, as router links with their text. */
  crumbs?: React.ReactNode[]
  title: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  const backLink = useRender({
    defaultTagName: 'a',
    render: back,
    props: {
      'aria-label': backLabel,
      title: backLabel,
      className:
        'grid size-9 shrink-0 place-items-center rounded-md border bg-card text-foreground hover:bg-muted',
      children: <ArrowLeftIcon aria-hidden className="size-[18px]" />,
    },
  })
  return (
    <header
      data-slot="page-bar"
      className={cn(
        '-mx-4 -mt-6 mb-6 flex flex-wrap items-center gap-3.5 border-b bg-card px-4 py-4 md:-mx-8 md:px-8',
        className,
      )}
    >
      {back ? backLink : null}
      <h1 className="flex min-w-0 flex-1 items-center gap-2.5 text-xl leading-tight md:text-[1.35rem]">
        {crumbs?.map((crumb, index) => (
          <React.Fragment key={index}>
            <span className="shrink truncate font-medium text-muted-foreground [&_a:hover]:text-foreground">
              {crumb}
            </span>
            <span aria-hidden className="shrink-0 font-normal text-input">
              ›
            </span>
          </React.Fragment>
        ))}
        <span className="min-w-0 truncate font-bold" aria-current="page">
          {title}
        </span>
      </h1>
      {right ? (
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {right}
        </div>
      ) : null}
    </header>
  )
}

/** A key fact shown as a pill (team, folder). */
function Pill({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="pill"
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border bg-muted px-3 py-1.5 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** Head of a list page (home, teams, members): title, actions on the right, short description. */
function PageTitle({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header data-slot="page-title" className={cn('grid gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[1.75rem] leading-tight">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  )
}

export { PageBar, PageTitle, Pill }
