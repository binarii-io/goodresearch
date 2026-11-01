import {
  type TeamStudy,
  useAttachStudy,
  useGetTeamStudiesCosts,
  useGetTeamStudiesOverview,
  useListProjects,
  useListTeamStudies,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
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
import { PageTitle } from '@goodresearch/ui/components/page-header'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useDeferredValue, useId, useState } from 'react'
import { CreateTeamStudyDialog } from '../../../features/research/create-team-study-dialog.tsx'
import { StudyCard } from '../../../features/research/study-card.tsx'
import { errorCode, errorMessage } from '../../../features/workspace/errors.ts'
import { useMe } from '../../../features/workspace/me.ts'

export const Route = createFileRoute('/_authenticated/team-studies/$teamId')({
  component: TeamStudiesPage,
})

/** Spec 019 US5: the home of a team's studies, including those in no project. */
function TeamStudiesPage() {
  const { t, i18n } = useLingui()
  const { teamId } = Route.useParams()
  const me = useMe()
  const [q, setQ] = useState('')
  const search = useId()
  const term = useDeferredValue(q.trim())
  const filter = term ? { q: term } : {}
  const studies = useListTeamStudies(teamId, filter, { query: { retry: false } })
  // Apart from the list, which never waits for them.
  const overview = useGetTeamStudiesOverview(teamId, filter)
  const costs = useGetTeamStudiesCosts(teamId, filter)

  return (
    <div className="grid gap-4">
      <PageTitle
        title={t`Studies of the team`}
        actions={studies.isSuccess ? <CreateTeamStudyDialog teamId={teamId} /> : null}
      />
      {me.teams.length > 1 ? (
        <nav aria-label={t`Teams`} className="flex flex-wrap gap-2">
          {me.teams.map((team) => (
            <Button
              key={team.id}
              size="sm"
              variant={team.id === teamId ? 'default' : 'outline'}
              render={
                <Link
                  to="/team-studies/$teamId"
                  params={{ teamId: team.id }}
                  aria-current={team.id === teamId ? 'page' : undefined}
                />
              }
            >
              {team.name}
            </Button>
          ))}
        </nav>
      ) : null}
      <div className="grid max-w-md gap-2">
        <Label htmlFor={search}>{t`Search by name`}</Label>
        <Input id={search} value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} />
      </div>
      {errorCode(studies.error) === 'TEAM_NOT_FOUND' ? (
        <p role="alert">{t`This team does not exist, or you are not in it.`}</p>
      ) : studies.isError ? (
        <p role="alert" className="text-destructive">
          {errorMessage(i18n, studies.error)}
        </p>
      ) : studies.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : studies.data.studies.length ? (
        <ul className="grid gap-2" aria-label={t`Studies of the team`}>
          {studies.data.studies.map((study) => (
            <StudyCard
              key={study.id}
              study={study}
              search={{ from: 'team' }}
              closed={!study.canAttach}
              counts={overview.data?.studies.find((o) => o.id === study.id)?.counts}
              cost={costs.data?.studies.find((c) => c.id === study.id)?.cost}
              actions={
                study.projects.length ? (
                  <Badge variant="secondary">
                    {plural(study.projects.length, { one: '# project', other: '# projects' })}
                  </Badge>
                ) : study.canAttach ? (
                  <AttachToProject study={study} teamId={teamId} />
                ) : (
                  <Badge variant="secondary">{t`No project`}</Badge>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t`No study found in this team.`}</p>
      )}
      {studies.data?.hasMore ? (
        <p className="text-muted-foreground text-sm">{t`More studies exist: search by name to find them.`}</p>
      ) : null}
    </div>
  )
}

function AttachToProject({ study, teamId }: { study: TeamStudy; teamId: string }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const attach = useAttachStudy()
  const [open, setOpen] = useState(false)
  const projects = useListProjects({ team: teamId }, { query: { enabled: open } })
  const linked = new Set(study.projects.map((p) => p.id))
  const choices = projects.data?.filter((p) => !linked.has(p.id)) ?? []
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="relative z-10" />}>
        {t`Attach to a project`}
        <span className="sr-only"> {study.name}</span>
      </DialogTrigger>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`Attach to a project`}</DialogTitle>
          <DialogDescription>{t`Its interviews and facts feed the project too, without any AI cost. Decisions on its facts apply in every project it is in.`}</DialogDescription>
        </DialogHeader>
        {choices.length ? (
          <ul
            className="grid max-h-80 grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto"
            aria-label={t`Projects of the team`}
          >
            {choices.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{project.name}</span>
                <Button
                  size="sm"
                  disabled={attach.isPending}
                  aria-label={t`Attach to ${project.name}`}
                  onClick={() =>
                    void attach
                      .mutateAsync({ projectId: project.id, studyId: study.id })
                      .then(async () => {
                        await queryClient.invalidateQueries()
                        setOpen(false)
                      })
                      .catch(() => undefined)
                  }
                >
                  {t`Attach`}
                </Button>
              </li>
            ))}
          </ul>
        ) : projects.isPending ? null : (
          <p className="text-muted-foreground text-sm">{t`No other project in this team.`}</p>
        )}
        {attach.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, attach.error)}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
