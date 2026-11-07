import {
  getFieldwork,
  getStudySource,
  type Proposal,
  useApplyProposal,
  useConfirmDeleteProposal,
  useDismissProposal,
  useGetProjectDeletion,
  useListPublications,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { SparklesIcon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { connectUrl, DriveExplanation } from '../ingestion/source-panel.tsx'
import { GuideView, questionCount, totalMinutes } from '../preparation/guide-view.tsx'
import {
  INTERFACE_KINDS,
  ITEM_FLAGS,
  ITEM_KINDS,
  type ItemKind,
  PROTOCOL_FLAGS,
  QUESTION_ISSUES,
  QUESTIONNAIRE_FLAGS,
  TASK_FLAGS,
} from '../preparation/labels.ts'
import { ProtocolView } from '../preparation/protocol-view.tsx'
import { itemCount, QuestionnaireView } from '../preparation/questionnaire-view.tsx'
import { DeletionSummary, forgetProject, NameToType } from '../research/delete-project-dialog.tsx'
import { errorMessage, messageForCode } from '../workspace/errors.ts'
import { Choices } from './choices.tsx'
import { FolderChangesCard } from './folder-changes-card.tsx'
import { InterviewLinesCard } from './interview-lines-card.tsx'
import { useAssistant } from './state.tsx'

const TITLES: Record<Proposal['kind'], MessageDescriptor> = {
  create_project: msg`Create a project`,
  update_project_goal: msg`Change the research goal`,
  rename_project: msg`Rename the project`,
  create_study: msg`Create a study`,
  rename_study: msg`Rename the study`,
  open_project: msg`Open a project`,
  open_study: msg`Open a study`,
  propose_interview_guide: msg`Interview guide`,
  propose_questionnaire: msg`Questionnaire`,
  report_questionnaire_progress: msg`Questionnaire design progress`,
  check_questionnaire_items: msg`Item check`,
  propose_protocol: msg`Test protocol`,
  report_protocol_progress: msg`Test protocol design progress`,
  check_protocol_tasks: msg`Task check`,
  count_responses: msg`Counted the responses`,
  propose_opening_form: msg`Open the form to responses`,
  propose_closing_form: msg`Close the form`,
  propose_target_rule: msg`Target audience`,
  survey_analysis_state: msg`Looked at the analysis`,
  read_figures: msg`Read the figures`,
  propose_survey_facts: msg`Facts from the figures`,
  propose_theme_analysis: msg`Find themes in open answers`,
  report_guide_progress: msg`Guide design progress`,
  report_project_progress: msg`Project framing progress`,
  report_study_progress: msg`Study framing progress`,
  load_skill: msg`Skill`,
  check_guide_questions: msg`Question check`,
  attach_study: msg`Reuse a study in this project`,
  detach_study: msg`Detach a study from this project`,
  update_study_goal: msg`Change the study's goal`,
  delete_project: msg`Delete this project`,
  attach_folder: msg`Add the study's folder`,
  connect_source: msg`Connect your Google Drive`,
  offer_choices: msg`Choices`,
  publish_preparation: msg`Publish to Drive`,
  browse_folder: msg`Opened the folder`,
  find_files: msg`Searched the folder`,
  count_interviews: msg`Counted the interviews`,
  list_interviews: msg`Looked at the interviews`,
  propose_analysis: msg`Analyse the interviews`,
  propose_accepting_suggestions: msg`Accept suggestions`,
  propose_validating_interviews: msg`Validate interviews`,
  propose_excluding_interviews: msg`Exclude interviews`,
  read_file: msg`Read a file`,
  propose_folder_changes: msg`Changes in the folder`,
  folder_consent: msg`Let the assistant see the folder`,
}

/** Product names, the same in every language. */
const PROVIDERS: Record<string, string> = {
  vertex: 'Vertex AI',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

const DOCUMENTS: Record<string, MessageDescriptor> = {
  guide: msg`Interview guide`,
  'best-practices': msg`Interview best practices`,
  questionnaire: msg`Questionnaire`,
  protocol: msg`Test protocol and participant sheet`,
  'participant-sheet': msg`Participant sheet`,
}

const SKILLS: Record<string, MessageDescriptor> = {
  'interview-guide-design': msg`Interview guide design`,
  'questionnaire-design': msg`Questionnaire design`,
  'test-protocol-design': msg`Test protocol design`,
  'project-framing': msg`Project framing`,
  'study-framing': msg`Study framing`,
}

/**
 * An action the assistant proposes (spec 005 US3): every value it will write, and nothing changes
 * until the person applies it.
 */
export function ProposalCard({
  proposal,
  onReply,
}: {
  proposal: Proposal
  /** Spec 022: given on the last answer only, to send a choice as the person's message. */
  onReply?: ((text: string) => void) | undefined
}) {
  if (proposal.kind === 'offer_choices') return <Choices proposal={proposal} onReply={onReply} />
  if (proposal.kind === 'open_project' || proposal.kind === 'open_study')
    return <OpenedPage proposal={proposal} />
  // Shown as the progress bar at the top of the conversation.
  if (
    proposal.kind === 'report_guide_progress' ||
    proposal.kind === 'report_questionnaire_progress' ||
    proposal.kind === 'report_protocol_progress' ||
    proposal.kind === 'report_project_progress' ||
    proposal.kind === 'report_study_progress'
  )
    return null
  if (proposal.kind === 'load_skill') return <SkillLine proposal={proposal} />
  if (proposal.kind === 'check_guide_questions') return <ChecksLine proposal={proposal} />
  if (proposal.kind === 'check_questionnaire_items') return <ItemChecksLine proposal={proposal} />
  if (proposal.kind === 'check_protocol_tasks') return <TaskChecksLine proposal={proposal} />
  if (proposal.kind === 'delete_project') return <DeleteCard proposal={proposal} />
  if (proposal.kind === 'connect_source') return <ConnectCard proposal={proposal} />
  if (proposal.kind === 'propose_folder_changes') return <FolderChangesCard proposal={proposal} />
  if (
    proposal.kind === 'propose_accepting_suggestions' ||
    proposal.kind === 'propose_validating_interviews' ||
    proposal.kind === 'propose_excluding_interviews'
  )
    return <InterviewLinesCard proposal={proposal} />
  if (
    proposal.kind === 'browse_folder' ||
    proposal.kind === 'find_files' ||
    proposal.kind === 'read_file' ||
    proposal.kind === 'count_interviews' ||
    proposal.kind === 'count_responses' ||
    proposal.kind === 'survey_analysis_state' ||
    proposal.kind === 'read_figures' ||
    proposal.kind === 'list_interviews'
  )
    return <FolderLine proposal={proposal} />
  return <ChangeCard proposal={proposal} />
}

/**
 * What the assistant did on its way to its answer: shown before it, as it happened. Cards come
 * after: they are what the answer leads to.
 */
export const isActivity = (proposal: Proposal) =>
  proposal.kind === 'load_skill' ||
  proposal.kind === 'check_guide_questions' ||
  proposal.kind === 'check_questionnaire_items' ||
  proposal.kind === 'check_protocol_tasks' ||
  proposal.kind === 'browse_folder' ||
  proposal.kind === 'find_files' ||
  proposal.kind === 'read_file' ||
  proposal.kind === 'count_interviews' ||
  proposal.kind === 'survey_analysis_state' ||
  proposal.kind === 'read_figures' ||
  proposal.kind === 'list_interviews'

/** Spec 024: what the assistant looked at in the folder: a quiet line, nothing to decide. */
function FolderLine({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const file = proposal.preview.fileName ?? ''
  return (
    <p className="text-muted-foreground text-xs">
      {proposal.kind === 'read_file'
        ? t`Read an extract of: ${file}`
        : proposal.kind === 'find_files'
          ? t`Searched the folder`
          : proposal.kind === 'count_responses'
            ? t`Counted the responses`
            : proposal.kind === 'read_figures'
              ? t`Read the figures`
              : proposal.kind === 'survey_analysis_state'
                ? t`Looked at the analysis`
                : proposal.kind === 'count_interviews'
                  ? t`Counted the interviews`
                  : proposal.kind === 'list_interviews'
                    ? t`Looked at the interviews`
                    : t`Looked in the folder`}
    </p>
  )
}

/** Spec 022: without a connection, only the person can give it, at Google. */
function ConnectCard({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const dismiss = useDismissProposal()
  const study = proposal.preview.studyName
  return (
    <section
      aria-label={i18n._(TITLES.connect_source)}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{i18n._(TITLES.connect_source)}</h3>
      {study ? <p className="font-medium">{study}</p> : null}
      {proposal.preview.access === 'write' ? (
        <p className="text-muted-foreground text-sm">{t`To create the documents in the study folder, goodresearch asks Google for the right to edit your Drive. It only writes the files a feature is about, and never deletes anything.`}</p>
      ) : (
        <DriveExplanation />
      )}
      {proposal.state === 'proposed' && proposal.preview.studyId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            render={
              <a
                href={connectUrl(proposal.preview.studyId, 'preparation', proposal.preview.access)}
              />
            }
          >
            {t`Continue to Google`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={dismiss.isPending}
            onClick={() =>
              void dismiss
                .mutateAsync({ proposalId: proposal.id })
                .then(() => queryClient.invalidateQueries())
                .catch(() => undefined)
            }
          >
            {t`Dismiss`}
          </Button>
        </div>
      ) : (
        <p role="status" className="font-medium">
          {proposal.state === 'applied' ? t`Connected` : t`Dismissed`}
        </p>
      )}
    </section>
  )
}

/** Spec 023: what the card creates, then its links once applied. */
function PublishedDocuments({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const applied = proposal.state === 'applied'
  const list = useListPublications(proposal.preview.studyId ?? '', {
    query: { enabled: applied && Boolean(proposal.preview.studyId) },
  })
  return (
    <div className="grid gap-1">
      <ul className="ml-5 list-disc">
        {(proposal.preview.documents ?? []).map((kind) => {
          const link = list.data?.find((p) => p.kind === kind)?.webLink
          const label = i18n._(DOCUMENTS[kind] ?? msg`Document`)
          return (
            <li key={kind}>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="underline">
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          )
        })}
      </ul>
      {applied ? null : (
        <p className="text-muted-foreground text-xs">{t`These files are created in the study folder. Nothing is written before you apply.`}</p>
      )}
    </div>
  )
}

/** One minute at most: a longer analysis stays visible on the page. */
const analysisOver = async (studyId: string) => {
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    const view = await getFieldwork(studyId).catch(() => null)
    if (view && view.run?.state !== 'running') return
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
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
function ItemChecksLine({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const n = proposal.preview.itemChecks?.items.length ?? 0
  return <p className="text-muted-foreground text-xs">{t`Checked ${n} items`}</p>
}

/** The assistant checked the tasks with the app's rules (spec 036). */
function TaskChecksLine({ proposal }: { proposal: Proposal }) {
  const { t } = useLingui()
  const n = proposal.preview.taskChecks?.tasks.length ?? 0
  return <p className="text-muted-foreground text-xs">{t`Checked ${n} tasks`}</p>
}

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
  const navigate = useNavigate()
  const { conversationId, setAppliedCard } = useAssistant()
  const apply = useApplyProposal()
  const dismiss = useDismissProposal()
  const p = proposal.preview
  const busy = apply.isPending || dismiss.isPending

  // The conversation and whatever the open page shows (project, studies, lists) may have changed.
  const refresh = () => queryClient.invalidateQueries()

  const guide = p.guide
  const protocol = p.protocol
  const flaggedTasks = (p.taskChecks?.tasks ?? []).filter((task) => task.flags.length > 0)
  const flaggedTaskCount = flaggedTasks.length
  const plannedMinutes = p.taskChecks?.plannedMinutes ?? 0
  const sessionMinutes = protocol?.framing.sessionMinutes ?? 0
  const taskCountOf = protocol?.tasks.length ?? 0
  const questionnaire = p.questionnaire
  const itemCountOf = questionnaire ? itemCount(questionnaire) : 0
  const sectionsOf = questionnaire?.sections.length ?? 0
  const estimated = p.itemChecks?.estimatedMinutes ?? 0
  const flaggedItems = (p.itemChecks?.items ?? []).filter((i) => i.flags.length > 0)
  const flaggedItemCount = flaggedItems.length
  const others = (p.otherProjects ?? []).join(', ')
  const provider = PROVIDERS[p.provider ?? ''] ?? p.provider ?? ''
  const interviewCount = p.interviews ?? 0
  const estimatedCost = (p.estimatedCost ?? 0).toFixed(2)
  const rows: [string, string | undefined][] = [
    [t`Study`, guide || questionnaire || protocol ? undefined : p.studyName],
    [
      t`Type`,
      p.type === 'survey' ? t`Survey` : p.type === 'usability-test' ? t`Usability test` : undefined,
    ],
    [t`Project`, p.projectName ?? (proposal.kind === 'create_study' ? t`No project` : undefined)],
    [t`Team`, p.teamName],
    [t`Folder`, p.folderName],
    [t`Owner`, p.folderOwner],
    [p.previousName ? t`New name` : t`Name`, p.name],
    [t`Current name`, p.previousName],
    [proposal.kind === 'create_study' ? t`Research goal` : t`New research goal`, p.goal],
  ]

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
      {p.targetRule ? (
        <div className="grid gap-2">
          <ul className="ml-5 list-disc">
            {p.targetRule.items.map((item) => (
              <li key={item.text}>
                {item.text}: {item.accepted.join(', ')}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            {t`Would set aside ${p.targetRule.setAside} of ${p.targetRule.total} responses. Nothing is deleted.`}
          </p>
        </div>
      ) : null}
      {p.surveyFacts ? (
        <div className="grid gap-2">
          <ul className="ml-5 list-disc">
            {p.surveyFacts.map((f) => (
              <li key={`${f.item}|${f.figure}|${f.cross ?? ''}`}>
                {f.item}: {f.figure}
                {f.cross ? ` (${f.cross})` : ''} · {t`base ${f.base}`}
                {f.smallBase ? ` · ${t`small base`}` : ''}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">{t`The app writes each statement from the figure as it is today. You then decide each fact.`}</p>
        </div>
      ) : null}
      {p.openItem ? (
        <div className="grid gap-1">
          <p>{t`${p.openItem.answers} answers to “${p.openItem.text}”, in ${p.openItem.parts} parts`}</p>
          <p className="text-muted-foreground text-xs">
            {p.estimatedCost === null || p.estimatedCost === undefined
              ? t`The cost could not be estimated.`
              : t`At most about $${estimatedCost}, on your AI provider.`}
          </p>
          <p className="text-muted-foreground text-xs">{t`The answers are masked before they are sent. The themes are proposals you decide in the Analysis tab.`}</p>
        </div>
      ) : null}
      {protocol ? (
        <div className="grid gap-2">
          <p>
            {p.studyName ? `${p.studyName} · ` : ''}
            {t`${taskCountOf} tasks · about ${plannedMinutes} min for sessions of ${sessionMinutes} min`}
          </p>
          <p className="text-muted-foreground text-xs">
            {t`Tested interface:`} {protocol.framing.interface.url} (
            {i18n._(INTERFACE_KINDS[protocol.framing.interface.kind])})
          </p>
          <p className="text-muted-foreground text-xs">
            {[
              protocol.questionnaire === 'sus-v1' ? t`ends with the System Usability Scale` : null,
              protocol.easeQuestion === 'seq-v1' ? t`ease question after each task` : null,
            ]
              .filter(Boolean)
              .join(' · ') || t`no standard question`}
          </p>
          {p.replacesProtocol ? (
            <p className="text-muted-foreground text-xs">{t`Replaces the current test protocol of the study.`}</p>
          ) : null}
          {flaggedTaskCount || p.taskChecks?.whole.length ? (
            <details>
              <summary className="cursor-pointer font-medium">{t`${flaggedTaskCount} tasks to review`}</summary>
              <ul className="mt-2 ml-5 list-disc">
                {flaggedTasks.map((task, i) => (
                  <li key={`${i}-${task.instruction}`}>
                    {task.instruction}:{' '}
                    {task.flags.map((f) => (TASK_FLAGS[f] ? i18n._(TASK_FLAGS[f]) : f)).join(', ')}
                  </li>
                ))}
                {(p.taskChecks?.whole ?? []).map((f) => (
                  <li key={f}>{PROTOCOL_FLAGS[f] ? i18n._(PROTOCOL_FLAGS[f]) : f}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details>
            <summary className="cursor-pointer font-medium">{t`Read the whole protocol`}</summary>
            <div className="mt-2">
              <ProtocolView protocol={protocol} compact />
            </div>
          </details>
        </div>
      ) : null}
      {questionnaire ? (
        <div className="grid gap-2">
          <p>
            {p.studyName ? `${p.studyName} · ` : ''}
            {t`${sectionsOf} sections · ${itemCountOf} items · about ${estimated} min`}
          </p>
          {p.replacesQuestionnaire ? (
            <p className="text-muted-foreground text-xs">{t`Replaces the current questionnaire of the study.`}</p>
          ) : null}
          {(Object.keys(ITEM_KINDS) as ItemKind[]).map((kind) => {
            const n = questionnaire.sections
              .flatMap((s) => s.items)
              .filter((i) => i.kind === kind).length
            return n ? (
              <p key={kind} className="text-muted-foreground text-xs">
                {i18n._(ITEM_KINDS[kind])}: {n}
              </p>
            ) : null
          })}
          {flaggedItemCount || p.itemChecks?.whole.length ? (
            <details>
              <summary className="cursor-pointer font-medium">{t`${flaggedItemCount} items to review`}</summary>
              <ul className="mt-2 ml-5 list-disc">
                {flaggedItems.map((item) => (
                  <li key={item.text}>
                    {item.text}:{' '}
                    {item.flags.map((f) => (ITEM_FLAGS[f] ? i18n._(ITEM_FLAGS[f]) : f)).join(', ')}
                  </li>
                ))}
                {(p.itemChecks?.whole ?? []).map((f) => (
                  <li key={f}>{QUESTIONNAIRE_FLAGS[f] ? i18n._(QUESTIONNAIRE_FLAGS[f]) : f}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <details>
            <summary className="cursor-pointer font-medium">{t`Read the whole questionnaire`}</summary>
            <div className="mt-2">
              <QuestionnaireView questionnaire={questionnaire} compact />
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
      {proposal.kind === 'publish_preparation' ? <PublishedDocuments proposal={proposal} /> : null}
      {proposal.kind === 'propose_analysis' ? (
        <div className="grid gap-1">
          <p>{t`${interviewCount} interviews to analyse`}</p>
          <p className="text-muted-foreground text-xs">
            {p.estimatedCost === null || p.estimatedCost === undefined
              ? t`The cost could not be estimated.`
              : t`At most about $${estimatedCost}, on your AI provider.`}
          </p>
          {p.consentNeeded ? (
            <p className="text-muted-foreground text-xs">{t`The beginning of each transcript is sent to your AI provider. Applying agrees to it for this study.`}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">{t`It finds who was interviewed, the date, the language and a name, as suggestions you decide.`}</p>
        </div>
      ) : null}
      {proposal.kind === 'folder_consent' ? (
        <p className="text-muted-foreground text-xs">
          {provider
            ? t`The names of the files of this study, and extracts of their content when it reads them, are sent to ${provider}. They often hold the names of the people interviewed. Nothing changes in Drive without your confirmation.`
            : t`Choose an AI provider first.`}
        </p>
      ) : null}
      {proposal.kind === 'attach_folder' ? (
        <p className="text-muted-foreground text-xs">{t`Nothing changes in Drive. Its files are then listed in Fieldwork.`}</p>
      ) : null}
      {proposal.kind === 'attach_study' ? (
        <p className="text-muted-foreground text-xs">{t`Its facts feed this project too, without any AI cost. Decisions on them apply in every project it is in.`}</p>
      ) : null}
      {proposal.kind === 'detach_study' ? (
        <p className="text-muted-foreground text-xs">
          {others
            ? t`Nothing is deleted: it stays in ${others}.`
            : t`Nothing is deleted: it stays on the team's Studies page, in no project.`}
        </p>
      ) : null}
      {proposal.state === 'proposed' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void apply
                .mutateAsync({ proposalId: proposal.id })
                .then(async (applied) => {
                  await refresh()
                  // As with the forms, what was created opens; the assistant goes on (spec 018, 021).
                  const created = applied.result
                  if (!created) return
                  if (proposal.kind === 'create_project' && created.kind === 'project') {
                    setAppliedCard({
                      page: { kind: 'project', id: created.id },
                      conversationId,
                    })
                    await navigate({
                      to: '/projects/$projectId',
                      params: { projectId: created.id },
                    })
                  }
                  // The inventory runs in the background: the assistant speaks once it is over.
                  if (proposal.kind === 'attach_folder' && created.kind === 'study') {
                    const phase = p.opensOn ?? 'fieldwork'
                    await navigate({
                      to: '/studies/$studyId',
                      params: { studyId: created.id },
                      search: { phase },
                    })
                    await inventoryOver(created.id)
                    setAppliedCard({
                      page: { kind: 'study', id: created.id, phase },
                      conversationId,
                    })
                  }
                  // Spec 025: the analysis runs in the background; the assistant speaks at its end.
                  if (proposal.kind === 'propose_analysis' && created.kind === 'study') {
                    await navigate({
                      to: '/studies/$studyId',
                      params: { studyId: created.id },
                      search: { phase: 'fieldwork' },
                    })
                    await analysisOver(created.id)
                    await refresh()
                    setAppliedCard({
                      page: { kind: 'study', id: created.id, phase: 'fieldwork' },
                      conversationId,
                    })
                  }
                  // Spec 024: agreed; the assistant goes on with what was asked.
                  if (proposal.kind === 'folder_consent' && created.kind === 'study')
                    setAppliedCard({ page: { kind: 'study', id: created.id }, conversationId })
                  // Spec 023: the guide or the documents are there; the assistant says what is next.
                  if (
                    (proposal.kind === 'propose_interview_guide' ||
                      proposal.kind === 'propose_questionnaire' ||
                      proposal.kind === 'propose_protocol' ||
                      proposal.kind === 'publish_preparation') &&
                    created.kind === 'study'
                  )
                    setAppliedCard({
                      page: { kind: 'study', id: created.id, phase: 'preparation' },
                      conversationId,
                    })
                  if (proposal.kind === 'create_study' && created.kind === 'study') {
                    // Nothing is prepared yet: Fieldwork would come too early (spec 022).
                    setAppliedCard({
                      page: { kind: 'study', id: created.id, phase: 'preparation' },
                      conversationId,
                    })
                    await navigate({
                      to: '/studies/$studyId',
                      params: { studyId: created.id },
                      search: { phase: 'preparation', ...(p.projectName ? {} : { from: 'team' }) },
                    })
                  }
                })
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
              search={
                proposal.kind === 'propose_interview_guide' ||
                proposal.kind === 'propose_questionnaire' ||
                proposal.kind === 'propose_protocol' ||
                proposal.kind === 'publish_preparation'
                  ? { phase: 'preparation' }
                  : {}
              }
            >
              {proposal.kind === 'propose_interview_guide'
                ? t`See the guide`
                : proposal.kind === 'propose_questionnaire'
                  ? t`See the questionnaire`
                  : proposal.kind === 'propose_protocol'
                    ? t`See the test protocol`
                    : t`Open the study`}
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

/**
 * Spec 020: the person types the project's name here; it only leaves with Apply. A wrong name
 * leaves the card open.
 */
function DeleteCard({ proposal }: { proposal: Proposal }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const confirm = useConfirmDeleteProposal()
  const dismiss = useDismissProposal()
  const [typed, setTyped] = useState('')
  const field = useId()
  const name = proposal.preview.projectName ?? ''
  const busy = confirm.isPending || dismiss.isPending
  const decided = proposal.state !== 'proposed'
  // What goes now, not when the card was shown; once decided, what was shown.
  const current = useGetProjectDeletion(proposal.preview.projectId ?? '', {
    query: { enabled: !decided && !confirm.data, staleTime: 0, gcTime: 0, retry: false },
  })
  const deletion = current.data ?? proposal.preview.deletion
  const applied = confirm.data?.state === 'applied' || proposal.state === 'applied'
  return (
    <section
      aria-label={t`Delete this project`}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{t`Delete this project`}</h3>
      <p className="font-medium">{name}</p>
      {deletion ? <DeletionSummary deletion={deletion} /> : null}
      {decided || confirm.data ? (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">
            {applied ? t`Deleted` : proposal.state === 'dismissed' ? t`Dismissed` : t`Not applied`}
          </span>
          {(confirm.data?.error ?? proposal.error) && !applied ? (
            <span className="text-destructive">
              {messageForCode(i18n, confirm.data?.error ?? proposal.error ?? undefined)}
            </span>
          ) : null}
        </p>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void confirm
              .mutateAsync({ proposalId: proposal.id, data: { name: typed } })
              .then(async (result) => {
                if (result.state !== 'applied') return
                const projectId = proposal.preview.projectId ?? ''
                if (pathname.startsWith(`/projects/${projectId}`)) await navigate({ to: '/' })
                forgetProject(queryClient, projectId)
              })
              .catch(() => undefined)
              .finally(() => void queryClient.invalidateQueries())
          }}
        >
          <NameToType name={name} field={field} />
          <Input
            id={field}
            value={typed}
            autoComplete="off"
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={busy || typed.trim() !== name}
            >
              {t`Delete for good`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void dismiss
                  .mutateAsync({ proposalId: proposal.id })
                  .then(() => queryClient.invalidateQueries())
                  .catch(() => undefined)
              }
            >
              {t`Dismiss`}
            </Button>
          </div>
        </form>
      )}
      {confirm.isError || dismiss.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, confirm.error ?? dismiss.error)}
        </p>
      ) : null}
    </section>
  )
}
