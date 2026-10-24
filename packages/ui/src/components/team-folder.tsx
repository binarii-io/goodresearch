import { cn } from 'cn'
import type * as React from 'react'

const TINTS = 4

const tintStyle = (tint: number) => {
  const n = (Math.abs(tint) % TINTS) + 1
  return {
    '--sheet': `var(--folder-${n})`,
    '--tab': `var(--folder-${n}-tab)`,
  } as React.CSSProperties
}

const folderClass =
  'relative mt-4 flex min-h-32 flex-col justify-between gap-5 rounded-lg rounded-tl-none bg-(--tab) px-4 pt-8 pb-5 text-left text-foreground'

/** The tab and the lighter sheet of a folder. */
function FolderDecor() {
  return (
    <>
      <span
        aria-hidden
        className="absolute -top-4 left-0 h-[17px] w-[42%] rounded-tl-lg rounded-tr-[8px] bg-(--tab)"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-[9px] bottom-[5px] rounded-lg bg-linear-to-b from-(--sheet) to-[color-mix(in_srgb,var(--sheet)_65%,var(--card))]"
      />
    </>
  )
}

/**
 * A team shown as a folder: a tab and a band in the darker tint, a lighter sheet on top. As a
 * toggle button it filters a list (`aria-pressed`).
 */
function TeamFolder({
  name,
  footer,
  tint = 0,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'children'> & {
  name: string
  footer?: React.ReactNode
  /** Any integer; folders cycle through four tints. */
  tint?: number
}) {
  return (
    <button
      type="button"
      data-slot="team-folder"
      style={tintStyle(tint)}
      className={cn(
        folderClass,
        'group/folder cursor-pointer transition-transform hover:-translate-y-0.5 aria-pressed:outline-2 aria-pressed:outline-offset-3 aria-pressed:outline-foreground aria-pressed:outline-solid',
        className,
      )}
      {...props}
    >
      <FolderDecor />
      <span className="relative truncate text-base font-bold tracking-tight" title={name}>
        {name}
      </span>
      {footer ? (
        <span className="relative flex items-center justify-between gap-2 border-t border-foreground/10 pt-3 text-sm text-muted-foreground">
          {footer}
        </span>
      ) : null}
    </button>
  )
}

/** The same folder as a static container, with its own content and actions (teams page). */
function Folder({
  tint = 0,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { tint?: number }) {
  return (
    <div
      data-slot="folder"
      style={tintStyle(tint)}
      className={cn(folderClass, className)}
      {...props}
    >
      <FolderDecor />
      <div className="relative grid gap-3">{children}</div>
    </div>
  )
}

export { Folder, TeamFolder }
