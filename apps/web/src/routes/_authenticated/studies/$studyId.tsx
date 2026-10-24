import {
  getGetStudyQueryKey,
  getListStudiesQueryKey,
  useDeleteStudy,
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
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { SourcePanel } from '../../../features/ingestion/source-panel.tsx'
import { errorCode, errorMessage } from '../../../features/workspace/errors.ts'
import { useMe } from '../../../features/workspace/me.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/studies/$studyId')({
  // Set by the Drive consent callback.
  validateSearch: z.object({ drive: z.enum(['connected', 'error']).optional().catch(undefined) }),
  component: StudyPage,
})

function StudyPage() {
  const { t, i18n } = useLingui()
  const { studyId } = Route.useParams()
  const { drive } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const study = useGetStudy(studyId)
  const source = useGetStudySource(studyId)
  const rename = useRenameStudy()
  const remove = useDeleteStudy()
  const [error, setError] = useState<unknown>(null)

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
    <article className="grid max-w-4xl gap-8">
      <header className="grid gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: s.project.id }}
          className="text-muted-foreground text-sm hover:underline"
        >
          {t`Project: ${projectName}`}
        </Link>
        <h1 className="text-2xl font-semibold">
          {canAct ? (
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
          )}
        </h1>
        <div>
          <Badge variant="secondary">{t`Interviews`}</Badge>
        </div>
      </header>

      <section className="grid gap-2" aria-labelledby="phase-preparation">
        <h2 id="phase-preparation" className="text-lg font-medium">
          {t`1. Preparation`}
        </h2>
        <p className="text-muted-foreground">{t`Design the interview guide and plan the sessions. Coming in a next version.`}</p>
      </section>
      <section className="grid gap-2" aria-labelledby="phase-fieldwork">
        <h2 id="phase-fieldwork" className="text-lg font-medium">
          {t`2. Fieldwork`}
        </h2>
        <p className="text-muted-foreground">{t`Run the interviews; recordings and transcripts land in the study's Drive folder.`}</p>
      </section>
      <section className="grid gap-3" aria-labelledby="phase-analysis">
        <h2 id="phase-analysis" className="text-lg font-medium">
          {t`3. Analysis`}
        </h2>
        <SourcePanel studyId={studyId} isAdmin={me.role === 'admin'} />
      </section>

      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="destructive" className="justify-self-start" />}
          >{t`Delete study`}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t`Delete this study?`}</AlertDialogTitle>
              <AlertDialogDescription>{t`The study and its inventory are removed from goodresearch. Nothing changes in Drive.`}</AlertDialogDescription>
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
      ) : null}
    </article>
  )
}
