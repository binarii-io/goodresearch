import {
  type Proposal,
  useApplyInterviewLinesProposal,
  useDismissProposal,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { PROPOSAL_FIELDS } from '../fieldwork/labels.ts'
import { errorMessage, messageForCode } from '../workspace/errors.ts'
import { useAssistant } from './state.tsx'

type Line = NonNullable<Proposal['preview']['interviewLines']>[number]

/**
 * Spec 025: the suggestions to accept, or the interviews to validate or exclude. Every value comes
 * from the app. Nothing changes before Apply; a line left unticked stays to decide.
 */
export function InterviewLinesCard({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const id = useId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { conversationId, setAppliedCard } = useAssistant()
  const apply = useApplyInterviewLinesProposal()
  const dismiss = useDismissProposal()
  const lines = proposal.preview.interviewLines ?? []
  // A doubtful line waits for the person's own look.
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(
    () => new Set(lines.filter((l) => l.flag).map((l) => l.index)),
  )
  const [reasons, setReasons] = useState<ReadonlyMap<number, string>>(
    () => new Map(lines.flatMap((l) => (l.reason ? [[l.index, l.reason] as const] : []))),
  )
  const busy = apply.isPending || dismiss.isPending
  const open = proposal.state === 'proposed'
  const excluding = proposal.kind === 'propose_excluding_interviews'
  const title =
    proposal.kind === 'propose_accepting_suggestions'
      ? t`Accept suggestions`
      : proposal.kind === 'propose_validating_interviews'
        ? t`Validate interviews`
        : t`Exclude interviews`
  const interviews = [...new Set(lines.map((l) => l.interviewId))]
  const kept = lines.filter((l) => !unticked.has(l.index))
  const reasonMissing = excluding && kept.some((l) => !reasons.get(l.index)?.trim())
  const refresh = () => queryClient.invalidateQueries()

  const flagOf = (line: Line) => {
    if (line.flag === 'no-transcript') return t`No transcript: left unticked.`
    if (line.flag?.startsWith('other-date:')) {
      const other = line.flag.slice('other-date:'.length)
      return t`Another date was found: ${other}. Left unticked.`
    }
    return null
  }
  const fieldOf = (line: Line) => {
    const label = line.field ? PROPOSAL_FIELDS[line.field as keyof typeof PROPOSAL_FIELDS] : null
    return label ? i18n._(label) : null
  }
  const outcomeOf = (line: Line) =>
    line.outcome === 'done'
      ? t`Done`
      : line.outcome === 'skipped'
        ? t`Left to decide`
        : messageForCode(i18n, line.outcome)

  const run = async () => {
    const applied = await apply.mutateAsync({
      proposalId: proposal.id,
      data: {
        excluded: [...unticked],
        ...(excluding
          ? {
              reasons: kept.map((l) => ({
                index: l.index,
                reason: reasons.get(l.index)?.trim() ?? '',
              })),
            }
          : {}),
      },
    })
    await refresh()
    const studyId = proposal.preview.studyId
    if (applied.state !== 'applied' || !studyId) return
    // Where the person sees what changed, and what the assistant is told is open.
    await navigate({ to: '/studies/$studyId', params: { studyId }, search: { phase: 'fieldwork' } })
    setAppliedCard({ page: { kind: 'study', id: studyId, phase: 'fieldwork' }, conversationId })
  }

  return (
    <section
      aria-label={title}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{title}</h3>
      <div className="grid max-h-96 grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto">
        {interviews.map((interviewId) => {
          const own = lines.filter((l) => l.interviewId === interviewId)
          const grouped = proposal.kind === 'propose_accepting_suggestions'
          return (
            <div key={interviewId} className="grid gap-1.5">
              {grouped ? <p className="break-words font-medium">{own[0]?.interview}</p> : null}
              <ul className="grid gap-2">
                {own.map((line) => {
                  const field = fieldOf(line)
                  const flag = flagOf(line)
                  const text = (
                    <span className="grid min-w-0 gap-0.5">
                      {field ? (
                        <span className="text-muted-foreground text-xs">{field}</span>
                      ) : null}
                      <span className="break-words">{line.value}</span>
                      {flag ? <span className="text-destructive text-xs">{flag}</span> : null}
                    </span>
                  )
                  return (
                    <li key={line.index} className="grid gap-1">
                      {open ? (
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={`${id}-${line.index}`}
                            className="mt-0.5 size-6"
                            checked={!unticked.has(line.index)}
                            disabled={busy}
                            onCheckedChange={(checked) => {
                              const next = new Set(unticked)
                              if (checked) next.delete(line.index)
                              else next.add(line.index)
                              setUnticked(next)
                            }}
                          />
                          <Label htmlFor={`${id}-${line.index}`} className="min-w-0 font-normal">
                            {text}
                          </Label>
                        </div>
                      ) : (
                        <div className="grid gap-0.5">
                          {text}
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
                      {excluding && open && !unticked.has(line.index) ? (
                        <div className="ml-6 grid gap-1">
                          <Label htmlFor={`${id}-reason-${line.index}`} className="text-xs">
                            {t`Reason`}
                          </Label>
                          <Input
                            id={`${id}-reason-${line.index}`}
                            value={reasons.get(line.index) ?? ''}
                            maxLength={500}
                            onChange={(e) => {
                              const next = new Map(reasons)
                              next.set(line.index, e.target.value)
                              setReasons(next)
                            }}
                          />
                        </div>
                      ) : null}
                      {excluding && !open && line.reason ? (
                        <span className="text-muted-foreground text-xs">{line.reason}</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      {open ? (
        <>
          <p className="text-muted-foreground text-xs">{t`Nothing changes before you apply. What you leave unticked stays to decide.`}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || kept.length === 0 || reasonMissing}
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
