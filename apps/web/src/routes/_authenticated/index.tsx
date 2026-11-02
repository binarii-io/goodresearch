import { useListProjects, useListTeamDirectory } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import { NewCard, ProjectCard } from '@goodresearch/ui/components/project-card'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { TeamFolder } from '@goodresearch/ui/components/team-folder'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { CreateProjectDialog } from '../../features/research/create-project-dialog.tsx'
import { useFormatRelative } from '../../features/workspace/format.ts'
import { useMe } from '../../features/workspace/me.ts'

export const Route = createFileRoute('/_authenticated/')({
  // The team filter lives in the address so the view can be shared (FR-017).
  validateSearch: z.object({
    team: z.uuid().optional().catch(undefined),
    // Spec 026: every team's projects are open to read.
    scope: z.enum(['mine', 'all']).optional().catch(undefined),
  }),
  beforeLoad: ({ context }) => {
    if (context.me.role === 'admin' && context.me.teams.length === 0)
      throw redirect({ to: '/welcome' })
  },
  component: Home,
})

const PAGE = 50

function Home() {
  const { t } = useLingui()
  const { team, scope: asked } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const me = useMe()
  // One list for the folders' counts and the cards; the folder filters it (spec 003, US3).
  const scope = asked ?? (me.teams.length > 0 ? 'mine' : 'all')
  // All teams can be many: the server filters, gives a page, and the directory counts (FR-022).
  const [limit, setLimit] = useState(PAGE)
  const projects = useListProjects(
    scope === 'all' ? { teams: 'all', limit, ...(team ? { team } : {}) } : { teams: 'mine' },
  )
  const directory = useListTeamDirectory({ query: { enabled: scope === 'all' } })
  const folders = scope === 'all' ? (directory.data ?? []) : me.teams
  const formatRelative = useFormatRelative()

  const all = projects.data ?? []
  const shown = team ? all.filter((project) => project.team.id === team) : all
  const everyTeam = directory.data ?? []
  const total =
    scope === 'all'
      ? everyTeam.filter((x) => !team || x.id === team).reduce((sum, x) => sum + x.projects, 0)
      : shown.length

  return (
    <div className="grid gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.75rem] leading-tight">{t`Research projects`}</h1>
        {me.teams.length > 0 && me.role !== 'admin' ? (
          <Segmented aria-label={t`Teams shown`}>
            <SegmentedItem
              pressed={scope === 'mine'}
              onClick={() => void navigate({ search: { scope: 'mine' } })}
            >
              {t`My teams`}
            </SegmentedItem>
            <SegmentedItem
              pressed={scope === 'all'}
              onClick={() => void navigate({ search: { scope: 'all' } })}
            >
              {t`All teams`}
            </SegmentedItem>
          </Segmented>
        ) : null}
      </div>
      {me.teams.length === 0 && me.role === 'member' ? (
        <p className="max-w-xl text-muted-foreground">{t`You are not in a team yet: you can read every team's work. To change it, ask an admin to add you to a team.`}</p>
      ) : null}

      <section aria-labelledby="home-teams" className="grid gap-4">
        <SectionTitle id="home-teams" count={folders.length}>{t`Teams`}</SectionTitle>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[18px]">
          {folders.map((x, index) => {
            const count =
              scope === 'all'
                ? (everyTeam.find((d) => d.id === x.id)?.projects ?? 0)
                : all.filter((project) => project.team.id === x.id).length
            return (
              <li key={x.id} className="grid gap-1">
                <TeamFolder
                  name={x.name}
                  tint={index}
                  aria-pressed={team === x.id}
                  onClick={() =>
                    void navigate({
                      search: {
                        ...(asked ? { scope: asked } : {}),
                        ...(team === x.id ? {} : { team: x.id }),
                      },
                    })
                  }
                  footer={<span>{plural(count, { one: '# project', other: '# projects' })}</span>}
                />
                {scope === 'all' ? (
                  <Link
                    to="/team-studies/$teamId"
                    params={{ teamId: x.id }}
                    className="text-sm underline underline-offset-2"
                  >
                    {t`Studies of ${x.name}`}
                  </Link>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="home-projects" className="grid gap-4">
        <SectionTitle id="home-projects" count={projects.isPending ? undefined : total}>
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
              {me.teams.length > 0 ? (
                <li className="grid">
                  <CreateProjectDialog
                    teams={me.teams}
                    defaultTeamId={me.teams.some((x) => x.id === team) ? team : undefined}
                    trigger={<NewCard />}
                  >
                    {t`New project`}
                  </CreateProjectDialog>
                </li>
              ) : null}
            </ul>
            {shown.length < total ? (
              <Button
                variant="outline"
                className="justify-self-start"
                onClick={() => setLimit((n) => Math.min(n + PAGE, 1_000))}
              >
                {t`Show more`}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
