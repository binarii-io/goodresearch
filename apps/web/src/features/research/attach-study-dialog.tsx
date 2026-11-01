import {
  getListStudiesQueryKey,
  useAttachStudy,
  useListTeamStudies,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@goodresearch/ui/components/dialog'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'

/** Spec 019 US1: reuses a study of the team in this project, without any AI call. */
export function AttachStudyDialog({ projectId, teamId }: { projectId: string; teamId: string }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const attach = useAttachStudy()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const search = useId()
  const term = useDeferredValue(q.trim())
  const studies = useListTeamStudies(
    teamId,
    { notInProject: projectId, ...(term ? { q: term } : {}) },
    { query: { enabled: open } },
  )

  // US1: only studies this person can open.
  const openStudies = studies.data?.studies.filter((study) => study.canAttach) ?? []

  const pick = async (studyId: string) => {
    await attach.mutateAsync({ projectId, studyId })
    // Every count of the page covers the new study.
    await queryClient.invalidateQueries()
    await queryClient.invalidateQueries({ queryKey: getListStudiesQueryKey(projectId) })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" />}
      >{t`Attach an existing study`}</DialogTrigger>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`Attach an existing study`}</DialogTitle>
          <DialogDescription>{t`Its interviews and facts feed this project too, without any AI cost. Decisions on its facts apply in every project it is in.`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={search}>{t`Search by name`}</Label>
          <Input id={search} value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} />
        </div>
        {openStudies.length ? (
          <ul className="grid max-h-80 gap-2 overflow-y-auto" aria-label={t`Studies to attach`}>
            {openStudies.map((study) => {
              const projects = study.projects.map((p) => p.name).join(', ')
              return (
                <li
                  key={study.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{study.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {projects ? t`In ${projects}` : t`No project`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={attach.isPending}
                    aria-label={t`Attach ${study.name}`}
                    onClick={() => void pick(study.id).catch(() => undefined)}
                  >
                    {t`Attach`}
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : studies.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, studies.error)}
          </p>
        ) : studies.isPending ? null : term ? (
          <p className="text-muted-foreground text-sm">{t`No study found in this team.`}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t`No other study in this team. Create a new one from the project.`}</p>
        )}
        {studies.data?.hasMore ? (
          <p className="text-muted-foreground text-sm">{t`More studies exist: search by name to find them.`}</p>
        ) : null}
        {attach.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, attach.error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
