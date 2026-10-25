import { useGetInterviewGuide } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  DownloadIcon,
  PencilIcon,
  SparklesIcon,
  SquarePenIcon,
} from '@goodresearch/ui/components/icons'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { useAssistant } from '../assistant/state.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { BestPracticesCard } from './best-practices.tsx'
import { downloadText, slug } from './download.ts'
import { GuideEditor, useEmptyGuide } from './guide-editor.tsx'
import { guideToMarkdown } from './guide-markdown.ts'
import { GuideView, questionCount } from './guide-view.tsx'
import { InterviewSchedule } from './schedule.tsx'

/**
 * The Preparation tab of an interview study (spec 006): the interview guide (with the assistant or
 * by hand), the best practices, the interview schedule. Shown only to people who can act on it.
 */
export function PreparationTab({ studyId, studyName }: { studyId: string; studyName: string }) {
  const { t, i18n } = useLingui()
  const guide = useGetInterviewGuide(studyId)
  const { ask } = useAssistant()
  const formatRelative = useFormatRelative()
  const empty = useEmptyGuide()
  const [editing, setEditing] = useState(false)

  // One design conversation per study: "Continue" reopens it, with its progress (PR #6 review).
  const design = () =>
    ask(
      guide.data
        ? t`Help me improve the interview guide of this study.`
        : t`Help me design the interview guide for this study.`,
      { thread: `guide:${studyId}` },
    )

  const g = guide.data
  const who = g?.updatedBy?.name || t`a deleted account`
  const when = g ? formatRelative(g.updatedAt) : ''
  const count = g ? questionCount(g.content) : 0

  return (
    <div className="grid gap-8">
      <p className="text-muted-foreground text-base">{t`Before the interviews: design the interview guide from the research goal, read the best practices, then plan the interviews.`}</p>

      <section aria-labelledby="guide-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle id="guide-heading" count={g ? count : undefined}>
            {t`Interview guide`}
          </SectionTitle>
          {g && !editing ? (
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
                    `${slug(studyName)}-${t`interview-guide`}.md`,
                    guideToMarkdown(i18n, studyName, g.content),
                    'text/markdown',
                  )
                }
              >
                <DownloadIcon aria-hidden />
                {t`Download (Markdown)`}
              </Button>
            </div>
          ) : null}
        </div>

        {guide.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : guide.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, guide.error)}
          </p>
        ) : editing ? (
          <GuideEditor
            studyId={studyId}
            guide={g ?? null}
            start={empty}
            onDone={() => setEditing(false)}
          />
        ) : g ? (
          <>
            <p className="text-muted-foreground text-sm">
              {g.origin === 'assistant'
                ? t`Version ${g.version + 1} · written with the assistant, applied by ${who} ${when}`
                : t`Version ${g.version + 1} · edited by hand by ${who} ${when}`}
            </p>
            <GuideView guide={g.content} />
          </>
        ) : (
          <div className="grid gap-3 rounded-lg border border-dashed p-5">
            <p>{t`The guide holds the framing (objectives, hypotheses, audience, format) and the questions of the four phases: introduction, warm-up, one section per research theme, wrap-up. It is used during the interviews, then to check their coverage and to group the findings by theme.`}</p>
            <p className="text-muted-foreground text-sm">{t`The assistant asks you a few questions, shows its progress and proposes the whole guide; nothing is saved until you apply it.`}</p>
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

      <BestPracticesCard />

      <InterviewSchedule studyId={studyId} studyName={studyName} />
    </div>
  )
}
