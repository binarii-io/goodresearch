import { InlineEdit, type InlineEditProps } from '@goodresearch/ui/components/inline-edit'
import { ReadOnlyBadge } from '@goodresearch/ui/components/read-only-badge'
import { useLingui } from '@lingui/react/macro'
import { createContext, type ReactNode, useContext } from 'react'

const CanChange = createContext(true)

/** Spec 026: whether the person may change what the page shows; the server decides anyway. */
export const CanChangeProvider = CanChange.Provider
export const useCanChange = () => useContext(CanChange)

/** An editable text for the team, a plain one for readers. */
export function ChangeableText(props: InlineEditProps) {
  const { t } = useLingui()
  const canChange = useCanChange()
  if (canChange) return <InlineEdit {...props} />
  return props.value ? (
    <p className="whitespace-pre-wrap">{props.value}</p>
  ) : (
    <p className="text-muted-foreground">{t`Nothing yet`}</p>
  )
}

/** Spec 026 FR-011: on another team's page, at once: read only, and whom to contact. */
export function ReadOnlyNote({ team, children }: { team: string; children?: ReactNode }) {
  const { t } = useLingui()
  return (
    <section
      aria-label={t`Read only`}
      className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm"
    >
      <ReadOnlyBadge team={team}>{t`Read only`}</ReadOnlyBadge>
      {children}
      <span>{t`Only team ${team} can change this page: contact it to suggest a change.`}</span>
    </section>
  )
}

/** What stays with the team: the names of the people interviewed (spec 026 FR-015). */
export function ReservedToTeam({ team }: { team: string }) {
  const { t } = useLingui()
  return (
    <p role="status" className="text-muted-foreground text-base">
      {t`This part is reserved to team ${team}: it holds the names of the people interviewed.`}
    </p>
  )
}
