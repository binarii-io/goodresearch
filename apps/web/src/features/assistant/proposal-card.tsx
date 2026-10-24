import { type Proposal, useApplyProposal, useDismissProposal } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { errorMessage, messageForCode } from '../workspace/errors.ts'

const TITLES: Record<Proposal['kind'], MessageDescriptor> = {
  create_project: msg`Create a project`,
  update_project_goal: msg`Change the research goal`,
  rename_project: msg`Rename the project`,
  create_study: msg`Create an interview study`,
  rename_study: msg`Rename the study`,
  open_project: msg`Open a project`,
  open_study: msg`Open a study`,
}

/**
 * An action the assistant proposes (spec 005 US3): every value it will write, and nothing changes
 * until the person applies it.
 */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === 'open_project' || proposal.kind === 'open_study')
    return <OpenedPage proposal={proposal} />
  return <ChangeCard proposal={proposal} />
}

/** A page the assistant opened (spec 005 US5): nothing to confirm, a link to go back to it. */
function OpenedPage({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const name = proposal.preview.name ?? proposal.preview.projectName ?? ''
  const phase = proposal.preview.phase
  const tabs = { preparation: t`Preparation`, fieldwork: t`Fieldwork`, analysis: t`Analysis` }
  if (proposal.result?.kind === 'study')
    return (
      <p className="text-sm">
        {t`Opened the study`}{' '}
        <Link
          className="underline"
          to="/studies/$studyId"
          params={{ studyId: proposal.result.id }}
          search={phase ? { phase } : {}}
        >
          {name}
        </Link>
        {phase ? ` · ${tabs[phase]}` : null}
      </p>
    )
  if (proposal.result?.kind === 'project')
    return (
      <p className="text-sm">
        {t`Opened the project`}{' '}
        <Link
          className="underline"
          to="/projects/$projectId"
          params={{ projectId: proposal.result.id }}
        >
          {name}
        </Link>
      </p>
    )
  return null
}

function ChangeCard({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const p = proposal.preview
  const busy = apply.isPending || dismiss.isPending

  // The conversation and whatever the open page shows (project, studies, lists) may have changed.
  const refresh = () => queryClient.invalidateQueries()

  const rows: [string, string | undefined][] = [
    [t`Project`, p.projectName],
    [t`Team`, p.teamName],
    [p.previousName ? t`New name` : t`Name`, p.name],
    [t`Current name`, p.previousName],
    [t`New research goal`, p.goal],
  ]

  return (
    <section
      aria-label={i18n._(TITLES[proposal.kind])}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{i18n._(TITLES[proposal.kind])}</h3>
      <dl className="grid gap-2">
        {rows
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>
      {proposal.state === 'proposed' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void apply
                .mutateAsync({ proposalId: proposal.id })
                .then(refresh)
                .catch(() => undefined)
            }
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
      ) : (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">
            {proposal.state === 'applied'
              ? t`Applied`
              : proposal.state === 'dismissed'
                ? t`Dismissed`
                : t`Not applied`}
          </span>
          {proposal.state === 'failed' && proposal.error ? (
            <span className="text-destructive">{messageForCode(i18n, proposal.error)}</span>
          ) : null}
          {proposal.result?.kind === 'project' ? (
            <Link
              className="underline"
              to="/projects/$projectId"
              params={{ projectId: proposal.result.id }}
            >
              {t`Open the project`}
            </Link>
          ) : proposal.result?.kind === 'study' ? (
            <Link
              className="underline"
              to="/studies/$studyId"
              params={{ studyId: proposal.result.id }}
            >
              {t`Open the study`}
            </Link>
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
