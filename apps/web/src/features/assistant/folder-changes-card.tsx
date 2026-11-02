import {
  getStudySource,
  type Proposal,
  useApplyFolderChangesProposal,
  useDismissProposal,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { errorMessage, messageForCode } from '../workspace/errors.ts'
import { useAssistant } from './state.tsx'

type Line = NonNullable<Proposal['preview']['lines']>[number]

/** A line left out takes with it what depends on it; the server applies the same rule. */
const withDependents = (lines: readonly Line[], out: ReadonlySet<number>): Set<number> => {
  const all = new Set(out)
  for (const line of lines)
    if (line.dependsOn !== null && all.has(line.dependsOn)) all.add(line.index)
  return all
}

/** One minute at most: a longer inventory stays visible on the page. */
const inventoryOver = async (studyId: string) => {
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    const view = await getStudySource(studyId).catch(() => null)
    if (view && view.source?.inventory.status !== 'running') return
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

/**
 * Spec 024: the changes the assistant prepared in the study's folder. Every line shows its before
 * and after, and nothing changes before Apply; the person unticks what they do not want.
 */
export function FolderChangesCard({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const id = useId()
  const queryClient = useQueryClient()
  const { conversationId, setAppliedCard } = useAssistant()
  const apply = useApplyFolderChangesProposal()
  const dismiss = useDismissProposal()
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set())
  const lines = proposal.preview.lines ?? []
  const out = withDependents(lines, unticked)
  const busy = apply.isPending || dismiss.isPending
  const open = proposal.state === 'proposed'
  const count = lines.length - out.size
  const refresh = () => queryClient.invalidateQueries()

  const kinds: Record<Line['kind'], string> = {
    'new-folder': t`New folder`,
    rename: t`Rename`,
    move: t`Move`,
  }
  const outcomeOf = (line: Line) =>
    line.outcome === 'done'
      ? t`Done`
      : line.outcome === 'skipped'
        ? t`Left out`
        : line.outcome === 'FILE_GONE'
          ? t`This file no longer exists, or you cannot open it.`
          : line.outcome === 'OUTSIDE_FOLDER'
            ? t`This item is not in the study's folder.`
            : messageForCode(i18n, line.outcome)

  const run = async () => {
    const applied = await apply.mutateAsync({
      proposalId: proposal.id,
      data: { excluded: [...out] },
    })
    await refresh()
    const studyId = proposal.preview.studyId
    if (applied.state !== 'applied' || !studyId) return
    await inventoryOver(studyId)
    await refresh()
    setAppliedCard({ page: { kind: 'study', id: studyId }, conversationId })
  }

  return (
    <section
      aria-label={t`Changes in the folder`}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{t`Changes in the folder`}</h3>
      {proposal.preview.studyName ? (
        <p className="font-medium">{proposal.preview.studyName}</p>
      ) : null}
      <ul className="grid max-h-96 grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto">
        {lines.map((line) => {
          const description = (
            <span className="grid min-w-0 gap-0.5">
              <span className="text-muted-foreground text-xs">{kinds[line.kind]}</span>
              <span className="break-words line-through decoration-muted-foreground/60">
                {line.before}
              </span>
              <span className="break-words font-medium">{line.after}</span>
            </span>
          )
          return (
            <li key={line.index} className="flex items-start gap-2">
              {open ? (
                <>
                  <Checkbox
                    id={`${id}-${line.index}`}
                    className="mt-0.5"
                    checked={!out.has(line.index)}
                    disabled={busy || (line.dependsOn !== null && out.has(line.dependsOn))}
                    onCheckedChange={(checked) => {
                      const next = new Set(unticked)
                      if (checked) next.delete(line.index)
                      else next.add(line.index)
                      setUnticked(next)
                    }}
                  />
                  <Label htmlFor={`${id}-${line.index}`} className="min-w-0 font-normal">
                    {description}
                  </Label>
                </>
              ) : (
                <div className="grid min-w-0 gap-0.5">
                  {description}
                  {line.outcome ? (
                    <span
                      className={
                        line.outcome === 'done' || line.outcome === 'skipped'
                          ? 'text-muted-foreground text-xs'
                          : 'text-destructive text-xs'
                      }
                    >
                      {outcomeOf(line)}
                    </span>
                  ) : null}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {open ? (
        <>
          <p className="text-muted-foreground text-xs">{t`Nothing changes in Drive before you apply, and nothing is ever deleted.`}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || count === 0}
              onClick={() => void run().catch(() => undefined)}
            >
              {t`Apply`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void dismiss
                  .mutateAsync({ proposalId: proposal.id })
                  .then(refresh)
                  .catch(() => undefined)
              }
            >
              {t`Dismiss`}
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="font-medium">
          {proposal.state === 'applied'
            ? t`Applied`
            : proposal.state === 'dismissed'
              ? t`Dismissed`
              : t`Not applied`}
          {proposal.state === 'failed' && proposal.error ? (
            <span className="block font-normal text-destructive">
              {messageForCode(i18n, proposal.error)}
            </span>
          ) : null}
        </p>
      )}
      {apply.isError || dismiss.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, apply.error ?? dismiss.error)}
        </p>
      ) : null}
    </section>
  )
}
