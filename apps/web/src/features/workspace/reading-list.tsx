import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  ChevronRightIcon,
  HourglassIcon,
  LoaderCircleIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'

export type ReadingItem = {
  sessionId: string
  title: string
  /** Its icon: waiting, being read, read, or failed or taken out. */
  step: 'waiting' | 'working' | 'done' | 'failed'
  /** Where it stands, in words. */
  label: string
  /** It can still be taken out of the reading. */
  stoppable: boolean
}

/**
 * Where a reading stands, interview by interview, each with "Take out" while it can be: the lexicon
 * reading's and the facts reading's.
 */
export function ReadingList({
  name,
  summary,
  items,
  takeOutLabel,
  onTakeOut,
  busy,
  footer,
}: {
  /** The section's title, also its accessible name. */
  name: string
  /** Where the whole reading stands, when known: stays visible when the list is folded. */
  summary?: string
  items: readonly ReadingItem[]
  /** The take-out button's accessible name for an interview. */
  takeOutLabel?: (title: string) => string
  onTakeOut?: (sessionId: string) => void
  busy?: boolean
  footer?: ReactNode
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(true)
  return (
    <section aria-label={name} className="grid gap-2 rounded-lg border p-3">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className="h-auto min-h-8 justify-start whitespace-normal text-left font-normal"
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          aria-hidden
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-medium">{name}</span>
        {summary ? <span className="text-muted-foreground">{summary}</span> : null}
      </Button>
      {open ? (
        <ul className="grid gap-1">
          {items.map((i) => (
            <li key={i.sessionId} className="flex min-h-8 items-center gap-2 text-sm">
              {i.step === 'waiting' ? (
                <HourglassIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              ) : i.step === 'working' ? (
                <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin" />
              ) : i.step === 'done' ? (
                <CheckIcon aria-hidden className="size-4 shrink-0" />
              ) : (
                <XIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate" title={i.title}>
                {i.title}
              </span>
              <span className="shrink-0 text-muted-foreground">{i.label}</span>
              {i.stoppable && onTakeOut ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy ?? false}
                  aria-label={takeOutLabel?.(i.title)}
                  onClick={() => onTakeOut(i.sessionId)}
                >
                  <XIcon aria-hidden />
                  {t`Take out`}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? footer : null}
    </section>
  )
}
