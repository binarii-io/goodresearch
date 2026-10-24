import { useListProjects } from '@goodresearch/api-client'
import { SectionTitle } from '@goodresearch/ui/components/count'
import { NewCard, ProjectCard } from '@goodresearch/ui/components/project-card'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { TeamFolder } from '@goodresearch/ui/components/team-folder'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { CreateProjectDialog } from '../../features/research/create-project-dialog.tsx'
import { useFormatRelative } from '../../features/workspace/format.ts'
import { useMe } from '../../features/workspace/me.ts'

export const Route = createFileRoute('/_authenticated/')({
  // The team filter lives in the address so the view can be shared (FR-017).
  validateSearch: z.object({ team: z.uuid().optional().catch(undefined) }),
  beforeLoad: ({ context }) => {
    if (context.me.role === 'admin' && context.me.teams.length === 0)
      throw redirect({ to: '/welcome' })
  },
  component: Home,
})

function Home() {
  const { t } = useLingui()
  const { team } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const me = useMe()
  // One list for the folders' counts and the cards; the folder filters it (spec 003, US3).
  const projects = useListProjects()
  const formatRelative = useFormatRelative()

  if (me.role === 'member' && me.teams.length === 0) {
    return (
      <div className="grid max-w-xl gap-4">
        <h1 className="text-[1.75rem] leading-tight">{t`No access yet`}</h1>
        <p>{t`You are signed in, but you are not in any team yet. Ask an admin to add you to a team to see its projects.`}</p>
      </div>
    )
  }

  const all = projects.data ?? []
  const shown = team ? all.filter((project) => project.team.id === team) : all

  return (
    <div className="grid gap-10">
      <h1 className="text-[1.75rem] leading-tight">{t`Research projects`}</h1>

      <section aria-labelledby="home-teams" className="grid gap-4">
        <SectionTitle id="home-teams" count={me.teams.length}>{t`Teams`}</SectionTitle>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[18px]">
          {me.teams.map((x, index) => {
            const count = all.filter((project) => project.team.id === x.id).length
            return (
              <li key={x.id} className="grid">
                <TeamFolder
                  name={x.name}
                  tint={index}
                  aria-pressed={team === x.id}
                  onClick={() => void navigate({ search: team === x.id ? {} : { team: x.id } })}
                  footer={<span>{plural(count, { one: '# project', other: '# projects' })}</span>}
                />
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="home-projects" className="grid gap-4">
        <SectionTitle id="home-projects" count={projects.isPending ? undefined : shown.length}>
          {t`Projects`}
        </SectionTitle>
        {projects.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            {shown.length === 0 ? (
              <p className="max-w-xl text-muted-foreground">
                {t`A project holds one research question: what you want to learn, why, and your hypotheses. Studies and their evidence will attach to it.`}
              </p>
            ) : null}
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[22px]"
              aria-label={t`Projects`}
            >
              {shown.map((project) => {
                const updated = formatRelative(project.updatedAt)
                return (
                  <li key={project.id} className="grid">
                    <ProjectCard
                      id={project.id}
                      title={project.name}
                      link={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
                      meta={
                        <>
                          <span>{updated}</span>
                          <span aria-hidden>•</span>
                          <span className="truncate">{project.team.name}</span>
                        </>
                      }
                    />
                  </li>
                )
              })}
              <li className="grid">
                <CreateProjectDialog teams={me.teams} defaultTeamId={team} trigger={<NewCard />}>
                  {t`New project`}
                </CreateProjectDialog>
              </li>
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
