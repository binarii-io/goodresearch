import {
  getGetStudyQueryKey,
  getListStudiesQueryKey,
  useDeleteStudy,
  useGetEnrichment,
  useGetInterviewFacts,
  useGetStudy,
  useGetStudySource,
  useRenameStudy,
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
      .enum(['preparation', 'fieldwork', 'lexicon', 'enrichment', 'analysis'])
      .optional()
      .catch(undefined),
    // An interview open in Enrichment (its cleaning) or Analysis (spec 012), and the turn to show.
    interview: z.string().min(1).max(64).optional().catch(undefined),
    turn: z.string().min(1).max(64).optional().catch(undefined),
  }),
  component: StudyPage,
})

function StudyPage() {
  const { t, i18n } = useLingui()
  const { studyId } = Route.useParams()
  const { drive, phase = 'fieldwork', interview, turn } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const study = useGetStudy(studyId)
  const source = useGetStudySource(studyId)
  const rename = useRenameStudy()
  const remove = useDeleteStudy()
  const [error, setError] = useState<unknown>(null)
  // Deeper than the study: the interview is the page, the study one of its parents.
  const deep = (phase === 'analysis' || phase === 'enrichment') && interview ? interview : null
  const facts = useGetInterviewFacts(studyId, deep ?? '', {
    query: { enabled: deep !== null && phase === 'analysis' },
  })
  const enrichment = useGetEnrichment(studyId, {
    query: { enabled: deep !== null && phase === 'enrichment' },
  })
  const deepTitle =
    phase === 'analysis'
      ? facts.data?.title
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
  const projectName = s.project.name
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
            <Link to="/projects/$projectId" params={{ projectId: s.project.id }} />
          )
        }
        backLabel={
          deep
            ? phase === 'analysis'
              ? t`Back to the analysis`
              : t`Back to the cleaning`
            : t`Back to the project`
        }
        foldedLabel={t`Pages above`}
        crumbs={[
          <Link key="projects" to="/">
            {t`Projects`}
          </Link>,
          <Link key="project" to="/projects/$projectId" params={{ projectId: s.project.id }}>
            {projectName}
          </Link>,
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
                  await queryClient.invalidateQueries({
                    queryKey: getListStudiesQueryKey(s.project.id),
                  })
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
              <TabsTrigger value="analysis">{t`5 · Analysis`}</TabsTrigger>
            </TabsList>
          </>
        }
      />
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
      <TabsContent value="analysis">
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
                  <AlertDialogDescription>{t`The study, its inventory and its interviews are removed from goodresearch. Nothing changes in Drive.`}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      void remove
                        .mutateAsync({ studyId })
                        .then(async () => {
                          await queryClient.invalidateQueries({
                            queryKey: getListStudiesQueryKey(s.project.id),
                          })
                          await navigate({
                            to: '/projects/$projectId',
                            params: { projectId: s.project.id },
                          })
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
