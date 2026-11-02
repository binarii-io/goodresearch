import {
  getGetQuestionnaireQueryKey,
  type Questionnaire,
  useGetQuestionnaire,
  useGetQuestionnaireDesignCost,
  useMarkQuestionnaireReadiness,
  useUnmarkQuestionnaireReadiness,
} from '@goodresearch/api-client'
import { QUESTIONNAIRE_PRACTICES } from '@goodresearch/shared'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  DownloadIcon,
  PencilIcon,
  SparklesIcon,
  SquarePenIcon,
} from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { normalise } from '../../app/i18n.ts'
import { useMoney } from '../assistant/cost.tsx'
import { useAssistant } from '../assistant/state.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { PracticesCard } from './best-practices.tsx'
import { downloadText, slug } from './download.ts'
import { DriveButton, DriveStatus, useDrivePublication } from './drive-publishing.tsx'
import { QUESTIONNAIRE_FLAGS } from './labels.ts'
import { QuestionnaireEditor, useEmptyQuestionnaire } from './questionnaire-editor.tsx'
import { questionnaireToMarkdown } from './questionnaire-markdown.ts'
import { itemCount, QuestionnaireView } from './questionnaire-view.tsx'

/** Spec 026: outside the team, the questionnaire holds no name: it reads like the guide. */
export function ReaderQuestionnaire({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const found = useGetQuestionnaire(studyId)
  const q = found.data
  return (
    <section aria-labelledby="questionnaire-heading" className="grid gap-3">
      <SectionTitle id="questionnaire-heading" count={q ? itemCount(q.content) : undefined}>
        {t`Questionnaire`}
      </SectionTitle>
      {found.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : found.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, found.error)}
        </p>
      ) : q ? (
        <QuestionnaireView questionnaire={q.content} />
      ) : (
        <p className="text-muted-foreground">{t`No questionnaire yet.`}</p>
      )}
    </section>
  )
}

/** What is and is not randomised (FR-015): said plainly, before and after publishing. */
function Randomisation({ q }: { q: Questionnaire }) {
  const { t } = useLingui()
  const r = q.randomisation
  return (
    <p className="text-muted-foreground text-sm">
      {[
        r.optionsShuffled ? t`The options of choices are shuffled.` : null,
        r.itemsShuffled
          ? t`The scales of a theme are shuffled within their grid.`
          : t`The items stay in a fixed order.`,
        t`The order of the themes stays fixed: the form cannot shuffle it.`,
      ]
        .filter(Boolean)
        .join(' ')}
    </p>
  )
}

/** The method's last checks (US6): they advise and block nothing. */
function Readiness({ studyId, q }: { studyId: string; q: Questionnaire }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const formatRelative = useFormatRelative()
  const mark = useMarkQuestionnaireReadiness()
  const unmark = useUnmarkQuestionnaireReadiness()
  const { publication } = useDrivePublication(studyId, 'questionnaire')
  const [people, setPeople] = useState('3')
  const id = useId()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetQuestionnaireQueryKey(studyId) })
  const of = (kind: 'review' | 'pre-test') => q.readiness.find((m) => m.kind === kind)
  const f = q.content.framing
  const computed: [string, boolean][] = [
    [t`Consent and thanks written`, Boolean(f.consent && f.thanks)],
    [t`Recruitment and target number written`, Boolean(f.audience && f.targetResponses)],
    [t`Published and in sync`, publication?.state === 'in-sync'],
  ]
  const human = (kind: 'review' | 'pre-test', label: string) => {
    const m = of(kind)
    const who = m?.by?.name || t`a deleted account`
    const when = m ? formatRelative(m.at) : ''
    const count = m?.people ?? 0
    return (
      <li className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            id={`${id}-${kind}`}
            checked={Boolean(m)}
            onCheckedChange={(checked) =>
              void (
                checked
                  ? mark.mutateAsync({
                      studyId,
                      kind,
                      data: { people: kind === 'pre-test' ? Number(people) || 1 : null },
                    })
                  : unmark.mutateAsync({ studyId, kind })
              )
                .then(refresh)
                .catch(() => undefined)
            }
          />
          <Label htmlFor={`${id}-${kind}`}>{label}</Label>
          {kind === 'pre-test' && !m ? (
            <span className="flex items-center gap-1 text-sm">
              <Label htmlFor={`${id}-people`}>{t`People`}</Label>
              <Input
                id={`${id}-people`}
                type="number"
                min={1}
                className="h-7 w-16"
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
            </span>
          ) : null}
        </div>
        {m ? (
          <p className="text-muted-foreground text-xs">
            {kind === 'pre-test'
              ? t`Pre-tested with ${count} people, marked by ${who} ${when}`
              : t`Marked by ${who} ${when}`}
            {m.changedSince ? ` · ${t`questionnaire changed since`}` : ''}
          </p>
        ) : null}
      </li>
    )
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-2 rounded-md border p-3">
      <h3 id={`${id}-heading`} className="font-semibold">{t`Before sending`}</h3>
      <p className="text-muted-foreground text-sm">{t`These checks advise: they block nothing.`}</p>
      <ul className="grid gap-2 text-sm">
        {computed.map(([label, done]) => (
          <li key={label}>
            {done ? '✓' : '○'} {label}
            <span className="sr-only">{done ? t`: done` : t`: to do`}</span>
          </li>
        ))}
        {human('review', t`Reviewed by another person`)}
        {human('pre-test', t`Pre-tested with a few naive participants, using the form's preview`)}
      </ul>
      {mark.isError || unmark.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, mark.error ?? unmark.error)}
        </p>
      ) : null}
    </section>
  )
}

/** The Preparation tab of a survey study (spec 027). */
export function QuestionnaireTab({ studyId, studyName }: { studyId: string; studyName: string }) {
  const { t, i18n } = useLingui()
  const found = useGetQuestionnaire(studyId)
  const cost = useGetQuestionnaireDesignCost(studyId)
  const { ask } = useAssistant()
  const money = useMoney()
  const formatRelative = useFormatRelative()
  const empty = useEmptyQuestionnaire()
  const [editing, setEditing] = useState(false)
  const practices = QUESTIONNAIRE_PRACTICES[normalise(i18n.locale)]

  const design = () =>
    ask(
      found.data
        ? t`Help me improve the questionnaire of this study.`
        : t`Help me design the questionnaire for this study.`,
      { thread: `questionnaire:${studyId}` },
    )

  const q = found.data
  const who = q?.updatedBy?.name || t`a deleted account`
  const when = q ? formatRelative(q.updatedAt) : ''
  const minutes = q?.estimatedMinutes ?? 0
  const spent = cost.data?.total
  const designCost = spent === null ? t`unknown` : money(spent ?? 0)

  return (
    <div className="grid gap-8">
      <p className="text-muted-foreground text-base">{t`Before sending: an objective, themes, then items. The questionnaire is published as a form in the study's Drive folder, closed to responses until Fieldwork. Edits made in the form come back here for review.`}</p>

      <section aria-labelledby="questionnaire-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle id="questionnaire-heading" count={q ? itemCount(q.content) : undefined}>
            {t`Questionnaire`}
          </SectionTitle>
          {q && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={design}>
                <SparklesIcon aria-hidden />
                {t`Continue with the assistant`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden />
                {t`Edit`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    `${slug(studyName)}-${t`questionnaire`}.md`,
                    questionnaireToMarkdown(i18n, studyName, q.content),
                    'text/markdown',
                  )
                }
              >
                <DownloadIcon aria-hidden />
                {t`Download (Markdown)`}
              </Button>
              <DriveButton studyId={studyId} kind="questionnaire" />
            </div>
          ) : null}
        </div>

        {!editing ? <DriveStatus studyId={studyId} kind="questionnaire" /> : null}

        {found.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : found.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, found.error)}
          </p>
        ) : editing ? (
          <QuestionnaireEditor
            studyId={studyId}
            questionnaire={q ?? null}
            start={empty}
            onDone={() => setEditing(false)}
          />
        ) : q ? (
          <>
            <p className="text-muted-foreground text-sm">
              {q.origin === 'assistant'
                ? t`Version ${q.version + 1} · written with the assistant, applied by ${who} ${when}`
                : q.origin === 'drive'
                  ? t`Version ${q.version + 1} · changes from the form accepted by ${who} ${when}`
                  : t`Version ${q.version + 1} · edited by hand by ${who} ${when}`}
            </p>
            <p className="text-sm">
              {t`Estimated time to answer: about ${minutes} min`}
              {spent !== undefined && spent !== 0
                ? ` · ${t`Cost of the design: ${designCost}`}`
                : ''}
            </p>
            <Randomisation q={q} />
            {q.checks.whole.length ? (
              <ul aria-label={t`To review on the whole`} className="ml-5 list-disc text-sm">
                {q.checks.whole.map((code) => {
                  const label = QUESTIONNAIRE_FLAGS[code]
                  return <li key={code}>{label ? i18n._(label) : code}</li>
                })}
              </ul>
            ) : null}
            <QuestionnaireView questionnaire={q.content} flags={q.checks.items} />
            <Readiness studyId={studyId} q={q} />
          </>
        ) : (
          <div className="grid gap-3 rounded-lg border border-dashed p-5">
            <p>{t`The questionnaire holds the framing (objective, target audience, recruitment, consent) and the items, grouped by theme. Each item says what it measures and what analysis it allows.`}</p>
            <p className="text-muted-foreground text-sm">{t`The assistant asks you a few questions, shows its progress and proposes the whole questionnaire; nothing is saved until you apply it.`}</p>
            {spent ? <p className="text-sm">{t`Cost of the design: ${designCost}`}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={design}>
                <SparklesIcon aria-hidden />
                {t`Design with the assistant`}
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <SquarePenIcon aria-hidden />
                {t`Write it myself`}
              </Button>
            </div>
          </div>
        )}
      </section>

      <PracticesCard
        doc={practices}
        summary={t`How to build a questionnaire: objective, items, order, consent, biases, and thinking ahead to the analysis.`}
        fileName={t`questionnaire-best-practices.md`}
      />
    </div>
  )
}
