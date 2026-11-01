import {
  getGetStudyQueryKey,
  useDeleteStudy,
  useGetEnrichment,
  useGetInterviewFacts,
  useGetQualityInterview,
  useGetStudy,
  useGetStudySource,
  useRenameStudy,
  useUpdateStudyGoal,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@goodresearch/ui/components/alert-dialog'
import { Button } from '@goodresearch/ui/components/button'
import { DangerZone } from '@goodresearch/ui/components/danger-zone'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { PageBar } from '@goodresearch/ui/components/page-header'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AnalysisTab } from '../../../features/analysis/analysis-tab.tsx'
import { EnrichmentTab } from '../../../features/enrichment/enrichment-tab.tsx'
import { FieldworkTab } from '../../../features/fieldwork/fieldwork-tab.tsx'
import { FolderButton } from '../../../features/ingestion/folder-button.tsx'
import { SourcePanel } from '../../../features/ingestion/source-panel.tsx'
import { PreparationTab } from '../../../features/preparation/preparation-tab.tsx'
import { QualityTab } from '../../../features/quality/quality-tab.tsx'
import { StudySettingsButton } from '../../../features/research/study-settings.tsx'
import { errorCode, errorMessage } from '../../../features/workspace/errors.ts'
import { useMe } from '../../../features/workspace/me.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/studies/$studyId')({
  // Set by the Drive consent callback.
  validateSearch: z.object({
    drive: z.enum(['connected', 'error']).optional().catch(undefined),
    // Opens on Fieldwork, where the source folder and the interviews are (spec 008).
    phase: z
      .enum(['preparation', 'fieldwork', 'lexicon', 'enrichment', 'quality', 'analysis'])
      .optional()
      .catch(undefined),
    // An interview open in Enrichment (its cleaning) or Analysis (spec 012), and the turn to show.
    interview: z.string().min(1).max(64).optional().catch(undefined),
    turn: z.string().min(1).max(64).optional().catch(undefined),
    // The Quality tab's view (spec 016 US4).
    view: z.enum(['overall', 'person', 'interview']).optional().catch(undefined),
    person: z.string().min(1).max(64).optional().catch(undefined),
    // Spec 019: where the study was opened from, a project or `team` (its Studies page), for "back".
    from: z.string().min(1).max(64).optional().catch(undefined),
  }),
  component: StudyPage,
})

function StudyPage() {
  const { t, i18n } = useLingui()
  const { studyId } = Route.useParams()
  const { drive, phase = 'fieldwork', interview, turn, from } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const updateGoal = useUpdateStudyGoal()
  const [goalError, setGoalError] = useState<unknown>(null)
  const me = useMe()
  const study = useGetStudy(studyId)
  const source = useGetStudySource(studyId)
  const rename = useRenameStudy()
  const remove = useDeleteStudy()
  const [error, setError] = useState<unknown>(null)
  // Deeper than the study: the interview is the page, the study one of its parents.
  const deep =
    (phase === 'analysis' || phase === 'enrichment' || phase === 'quality') && interview
      ? interview
      : null
  const facts = useGetInterviewFacts(studyId, deep ?? '', {
    query: { enabled: deep !== null && phase === 'analysis' },
  })
  const enrichment = useGetEnrichment(studyId, {
    query: { enabled: deep !== null && phase === 'enrichment' },
  })
  const quality = useGetQualityInterview(studyId, deep ?? '', {
    query: { enabled: deep !== null && phase === 'quality' },
  })
  const deepTitle =
    phase === 'analysis'
      ? facts.data?.title
      : phase === 'quality'
        ? quality.data?.title
        : enrichment.data?.interviews.find((i) => i.sessionId === deep)?.title
  const openInterview = (sessionId: string | null, segmentId?: string) =>
    void navigate({
      to: '.',
      search: (previous) => ({
        ...previous,
        interview: sessionId ?? undefined,
        turn: segmentId,
      }),
    })

  // Shown once per return from Google's consent: the toast id prevents duplicates and the
  // parameter is removed from the address right away.
  const announced = useRef<string | null>(null)
  useEffect(() => {
    if (!drive || announced.current === drive) return
    announced.current = drive
    if (drive === 'connected')
      toast.success(i18n._(msg`Google Drive connected`), { id: 'drive-consent' })
    else
      toast.error(i18n._(msg`Google Drive was not connected. You can try again.`), {
        id: 'drive-consent',
      })
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, drive: undefined }),
      replace: true,
    })
  }, [drive, navigate, i18n])

  if (study.isPending) return <Skeleton className="h-40 w-full" />
  if (errorCode(study.error) === 'STUDY_NOT_FOUND' || !study.data) return <NotFound />
  const s = study.data
  // Spec 019: where it was opened from if still linked, else its first project, else its team.
  const parent =
    from === 'team' ? undefined : (s.projects.find((p) => p.id === from) ?? s.projects[0])
  const others = s.projects.map((p) => p.name).join(', ')
  const parentLink = parent ? (
    <Link to="/projects/$projectId" params={{ projectId: parent.id }} />
  ) : (
    <Link to="/team-studies/$teamId" params={{ teamId: s.team.id }} />
  )
  const refreshLists = () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        [s.team.id, ...s.projects.map((p) => p.id)].some((id) =>
          query.queryKey.join('/').includes(id),
        ),
    })
  // FR-010a: without folder access, only the name and type are shown and nothing can be changed.
  const canAct = source.data?.access === 'full'
  const canDelete = canAct || me.role === 'admin'

  return (
    <Tabs
      value={phase}
      onValueChange={(value) =>
        void navigate({
          to: '.',
          // Another phase opens on its own list, not on the interview open here.
          search: (previous) => ({
            ...previous,
            phase: value,
            interview: undefined,
            turn: undefined,
          }),
          replace: true,
        })
      }
      className="gap-4"
    >
      <PageBar
        back={
          deep ? (
            <Link
              to="."
              search={(previous) => ({ ...previous, interview: undefined, turn: undefined })}
            />
          ) : (
            parentLink
          )
        }
        backLabel={
          deep
            ? phase === 'analysis'
              ? t`Back to the analysis`
              : phase === 'quality'
                ? t`Back to the interviews`
                : t`Back to the cleaning`
            : parent
              ? t`Back to the project`
              : t`Back to the team's studies`
        }
        foldedLabel={t`Pages above`}
        crumbs={[
          ...(parent
            ? [
                <Link key="projects" to="/">
                  {t`Projects`}
                </Link>,
                <Link key="project" to="/projects/$projectId" params={{ projectId: parent.id }}>
                  {parent.name}
                </Link>,
              ]
            : [
                <Link key="team" to="/team-studies/$teamId" params={{ teamId: s.team.id }}>
                  {t`Studies`}
                </Link>,
              ]),
          ...(deep
            ? [
                <Link
                  key="study"
                  to="."
                  search={(previous) => ({ ...previous, interview: undefined, turn: undefined })}
                >
                  {s.name}
                </Link>,
              ]
            : []),
        ]}
        title={
          deep ? (
            <span title={deepTitle}>{deepTitle ?? '…'}</span>
          ) : canAct ? (
            <InlineEdit
              label={t`Study name`}
              value={s.name}
              maxLength={120}
              savedMessage={t`Name saved`}
              editHint={t`Enter to save, Escape to cancel`}
              error={error ? errorMessage(i18n, error) : undefined}
              onSave={async (name) => {
                setError(null)
                try {
                  await rename.mutateAsync({ studyId, data: { name, version: s.version } })
                  await queryClient.invalidateQueries({ queryKey: getGetStudyQueryKey(studyId) })
                  await refreshLists()
                } catch (failure) {
                  setError(failure)
                  throw failure
                }
              }}
            />
          ) : (
            s.name
          )
        }
        right={
          <>
            <FolderButton
              studyId={studyId}
              isAdmin={me.role === 'admin'}
              interviewStudy={s.type === 'interviews'}
            />
            {canAct && s.type === 'interviews' ? <StudySettingsButton study={s} /> : null}
            <TabsList aria-label={t`Study phases`}>
              <TabsTrigger value="preparation">{t`1 · Preparation`}</TabsTrigger>
              <TabsTrigger value="fieldwork">{t`2 · Fieldwork`}</TabsTrigger>
              <TabsTrigger value="lexicon">{t`3 · Lexicon`}</TabsTrigger>
              <TabsTrigger value="enrichment">{t`4 · Enrichment`}</TabsTrigger>
              <TabsTrigger value="quality">{t`5 · Quality`}</TabsTrigger>
              <TabsTrigger value="analysis">{t`6 · Analysis`}</TabsTrigger>
            </TabsList>
          </>
        }
      />
      <section className="grid gap-1" aria-label={t`About this study`}>
        {s.projects.length > 1 ? (
          <p className="text-muted-foreground text-sm">
            {t`Feeds these projects:`}{' '}
            {s.projects.map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ', ' : ''}
                <Link className="underline" to="/projects/$projectId" params={{ projectId: p.id }}>
                  {p.name}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {canAct ? (
          <div className="max-w-[900px] text-sm">
            <InlineEdit
              label={t`Research goal of the study`}
              value={s.goal}
              multiline
              maxLength={10_000}
              placeholder={t`What this study wants to find out. Its AI steps read it.`}
              savedMessage={t`Goal saved`}
              editHint={t`Ctrl+Enter to save, Escape to cancel`}
              error={goalError ? errorMessage(i18n, goalError) : undefined}
              onSave={async (goal) => {
                setGoalError(null)
                try {
                  await updateGoal.mutateAsync({ studyId, data: { goal, version: s.version } })
                  await queryClient.invalidateQueries({ queryKey: getGetStudyQueryKey(studyId) })
                } catch (failure) {
                  setGoalError(failure)
                  throw failure
                }
              }}
            />
          </div>
        ) : null}
      </section>
      <TabsContent value="preparation">
        {s.type !== 'interviews' ? (
          <p className="text-muted-foreground text-base">{t`Preparation for this type of study is coming in a later version.`}</p>
        ) : source.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : canAct ? (
          <PreparationTab studyId={studyId} studyName={s.name} />
        ) : (
          <p className="text-muted-foreground text-base">{t`You need access to this study's Drive folder to see and change its preparation.`}</p>
        )}
      </TabsContent>
      <TabsContent value="fieldwork">
        {s.type === 'interviews' ? (
          <FieldworkTab studyId={studyId} isAdmin={me.role === 'admin'} />
        ) : (
          <div className="grid gap-3">
            <p className="text-muted-foreground text-base">{t`Fieldwork for this type of study is coming in a later version.`}</p>
            <SourcePanel studyId={studyId} isAdmin={me.role === 'admin'} />
          </div>
        )}
      </TabsContent>
      <TabsContent value="lexicon">
        {s.type !== 'interviews' ? (
          <p className="text-muted-foreground text-base">{t`The lexicon for this type of study is coming in a later version.`}</p>
        ) : source.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : canAct ? (
          <EnrichmentTab studyId={studyId} part="lexicon" />
        ) : (
          <p className="text-muted-foreground text-base">{t`You need access to this study's Drive folder to see its interviews.`}</p>
        )}
      </TabsContent>
      <TabsContent value="enrichment">
        {s.type !== 'interviews' ? (
          <p className="text-muted-foreground text-base">{t`Enrichment for this type of study is coming in a later version.`}</p>
        ) : source.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : canAct ? (
          <EnrichmentTab
            studyId={studyId}
            part="cleaning"
            reviewing={interview ?? null}
            onReview={(sessionId) => openInterview(sessionId)}
          />
        ) : (
          <p className="text-muted-foreground text-base">{t`You need access to this study's Drive folder to see its interviews.`}</p>
        )}
      </TabsContent>
      <TabsContent value="quality">
        {s.type !== 'interviews' ? (
          <p className="text-muted-foreground text-base">{t`Quality for this type of study is coming in a later version.`}</p>
        ) : source.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : canAct ? (
          <QualityTab studyId={studyId} interview={interview} turn={turn} />
        ) : (
          <p className="text-muted-foreground text-base">{t`You need access to this study's Drive folder to see its interviews.`}</p>
        )}
      </TabsContent>
      <TabsContent value="analysis">
        {s.projects.length > 1 ? (
          <p className="mb-3 text-muted-foreground text-sm">{t`This study feeds ${others}: decisions on its facts apply in all of them.`}</p>
        ) : null}
        {s.type !== 'interviews' ? (
          <p className="text-muted-foreground text-base">{t`Analysis for this type of study is coming in a later version.`}</p>
        ) : source.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : canAct ? (
          <AnalysisTab
            studyId={studyId}
            open={interview ? { sessionId: interview, segmentId: turn ?? null } : null}
            onOpen={openInterview}
          />
        ) : (
          <p className="text-muted-foreground text-base">{t`You need access to this study's Drive folder to see its interviews.`}</p>
        )}
      </TabsContent>

      {canDelete ? (
        <details className="group mt-10">
          <summary className="w-fit cursor-pointer text-muted-foreground text-sm hover:text-destructive">
            {t`Delete this study`}
          </summary>
          <DangerZone
            className="mt-2.5"
            title={t`Delete this study`}
            description={t`The study, its inventory and its interviews are removed from goodresearch. Nothing changes in Drive.`}
          >
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" />}>
                {t`Delete study`}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t`Delete this study?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {s.projects.length > 1
                      ? t`The study, its inventory and its interviews are removed from goodresearch, and from all the projects it feeds: ${others}. Nothing changes in Drive.`
                      : t`The study, its inventory and its interviews are removed from goodresearch. Nothing changes in Drive.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      void remove
                        .mutateAsync({ studyId })
                        .then(async () => {
                          await refreshLists()
                          await (parent
                            ? navigate({
                                to: '/projects/$projectId',
                                params: { projectId: parent.id },
                              })
                            : navigate({
                                to: '/team-studies/$teamId',
                                params: { teamId: s.team.id },
                              }))
                        })
                        .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                    }
                  >
                    {t`Delete`}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DangerZone>
        </details>
      ) : null}
    </Tabs>
  )
}
