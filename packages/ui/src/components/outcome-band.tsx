import type * as React from 'react'

/** The result of a piece of work, read first; `id` names the section for assistive technology. */
function OutcomeBand({
  id,
  title,
  action,
  note,
  children,
}: {
  id: string
  title: React.ReactNode
  /** A link, styled here. */
  action?: React.ReactNode
  note?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      data-slot="outcome-band"
      aria-labelledby={id}
      className="grid gap-2.5 rounded-lg bg-primary px-[26px] py-[22px] text-primary-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="font-semibold text-xs uppercase tracking-[0.12em] opacity-80">
          {title}
        </h2>
        {action ? (
          <span className="font-medium text-sm underline underline-offset-3">{action}</span>
        ) : null}
      </div>
      <p className="max-w-[980px] whitespace-pre-line text-xl leading-normal tracking-tight">
        {children}
      </p>
      {note ? <p className="text-sm opacity-80">{note}</p> : null}
    </section>
  )
}

export { OutcomeBand }
