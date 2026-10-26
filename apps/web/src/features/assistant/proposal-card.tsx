import { type Proposal, useApplyProposal, useDismissProposal } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { SparklesIcon } from '@goodresearch/ui/components/icons'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { GuideView, questionCount, totalMinutes } from '../preparation/guide-view.tsx'
import { QUESTION_ISSUES } from '../preparation/labels.ts'
import { errorMessage, messageForCode } from '../workspace/errors.ts'

const TITLES: Record<Proposal['kind'], MessageDescriptor> = {
  create_project: msg`Create a project`,
  update_project_goal: msg`Change the research goal`,
  rename_project: msg`Rename the project`,
  create_study: msg`Create an interview study`,
  rename_study: msg`Rename the study`,
  open_project: msg`Open a project`,
  open_study: msg`Open a study`,
  propose_interview_guide: msg`Interview guide`,
  report_guide_progress: msg`Guide design progress`,
  load_skill: msg`Skill`,
  check_guide_questions: msg`Question check`,
}

const SKILLS: Record<string, MessageDescriptor> = {
  'interview-guide-design': msg`Interview guide design`,
}

/**
 * An action the assistant proposes (spec 005 US3): every value it will write, and nothing changes
 * until the person applies it.
 */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === 'open_project' || proposal.kind === 'open_study')
    return <OpenedPage proposal={proposal} />
  // Shown as the progress bar at the top of the conversation.
  if (proposal.kind === 'report_guide_progress') return null
  if (proposal.kind === 'load_skill') return <SkillLine proposal={proposal} />
  if (proposal.kind === 'check_guide_questions') return <ChecksLine proposal={proposal} />
  return <ChangeCard proposal={proposal} />
}

/** The assistant loaded a skill (spec 006): a quiet line, nothing to decide. */
function SkillLine({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const skill = proposal.preview.skill ?? ''
  const name = SKILLS[skill] ? i18n._(SKILLS[skill]) : skill
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <SparklesIcon aria-hidden className="size-3.5" />
      {t`Using the skill: ${name}`}
    </p>
  )
}

/** Questions flagged by the app's writing rules, in words. */
function FlaggedQuestions({ checks }: { checks: NonNullable<Proposal['preview']['checks']> }) {
  const { i18n } = useLingui()
  return (
    <ul className="grid gap-1.5">
      {checks.map((c) => (
        <li key={c.question} className="grid gap-0.5">
          <span>{c.question}</span>
          <span className="text-muted-foreground text-xs">
            {c.issues
              .map((issue) => (QUESTION_ISSUES[issue] ? i18n._(QUESTION_ISSUES[issue]) : issue))
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The assistant checked wordings with the app's rules (spec 006). */
function ChecksLine({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const checks = proposal.preview.checks ?? []
  const flagged = checks.filter((c) => c.issues.length > 0)
  const total = checks.length
  const count = flagged.length
  if (count === 0)
    return (
      <p className="text-muted-foreground text-xs">{t`Checked ${total} questions: nothing to review.`}</p>
    )
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        {t`Checked ${total} questions: ${count} to review`}
      </summary>
      <div className="mt-2 text-sm">
        <FlaggedQuestions checks={flagged} />
      </div>
    </details>
  )
}

/** A page the assistant opened (spec 005 US5): nothing to confirm, a link to go back to it. */
function OpenedPage({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const name = proposal.preview.name ?? proposal.preview.projectName ?? ''
  const phase = proposal.preview.phase
  const tabs = {
    preparation: t`Preparation`,
    fieldwork: t`Fieldwork`,
    enrichment: t`Enrichment`,
    analysis: t`Analysis`,
  }
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

  const guide = p.guide
  const sectionCount = guide?.sections.length ?? 0
  const questions = guide ? questionCount(guide) : 0
  const minutes = guide ? totalMinutes(guide) : 0
  const flagged = p.checks ?? []
  const flaggedCount = flagged.length

  return (
    <section
      aria-label={i18n._(TITLES[proposal.kind])}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{i18n._(TITLES[proposal.kind])}</h3>
      {guide ? (
        <div className="grid gap-2">
          <p>
            {p.studyName ? `${p.studyName} · ` : ''}
            {t`${sectionCount} sections · ${questions} main questions · ${minutes} min`}
          </p>
          {p.replacesGuide ? (
            <p className="text-muted-foreground text-xs">{t`Replaces the current guide of the study.`}</p>
          ) : null}
          <ol className="ml-5 list-decimal text-muted-foreground">
            {guide.sections.map((s, i) => (
              <li key={i}>
                {s.title} · {t`${s.minutes} min`}
              </li>
            ))}
          </ol>
          {flaggedCount ? (
            <details>
              <summary className="cursor-pointer font-medium">{t`${flaggedCount} questions to review`}</summary>
              <div className="mt-2">
                <FlaggedQuestions checks={flagged} />
              </div>
            </details>
          ) : null}
          <details>
            <summary className="cursor-pointer font-medium">{t`Read the whole guide`}</summary>
            <div className="mt-2">
              <GuideView guide={guide} compact />
            </div>
          </details>
        </div>
      ) : null}
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
              search={proposal.kind === 'propose_interview_guide' ? { phase: 'preparation' } : {}}
            >
              {proposal.kind === 'propose_interview_guide' ? t`See the guide` : t`Open the study`}
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
