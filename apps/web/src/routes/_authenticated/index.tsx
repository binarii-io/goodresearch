import { useListProjects } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@goodresearch/ui/components/card'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { z } from 'zod'
import { CreateProjectDialog } from '../../features/research/create-project-dialog.tsx'
import { useFormatDate } from '../../features/workspace/format.ts'
import { useMe } from '../../features/workspace/me.ts'

const ALL = 'all'

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
  const projects = useListProjects(team ? { team } : undefined)
  const formatDate = useFormatDate()
  const filterId = useId()

  if (me.role === 'member' && me.teams.length === 0) {
    return (
      <div className="grid max-w-xl gap-4">
        <h1 className="text-2xl font-semibold">{t`No access yet`}</h1>
        <p>{t`You are signed in, but you are not in any team yet. Ask an admin to add you to a team to see its projects.`}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t`Projects`}</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label id={filterId}>{t`Team`}</Label>
            <Select
              value={team ?? ALL}
              onValueChange={(value) =>
                void navigate({ search: value && value !== ALL ? { team: value } : {} })
              }
            >
              <SelectTrigger aria-labelledby={filterId} className="min-w-44">
                <SelectValue>
                  {(value: string) =>
                    value === ALL ? t`All teams` : me.teams.find((x) => x.id === value)?.name
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t`All teams`}</SelectItem>
                {me.teams.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CreateProjectDialog teams={me.teams} defaultTeamId={team} />
        </div>
      </div>

      {projects.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : projects.data && projects.data.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t`Projects`}>
          {projects.data.map((project) => {
            const updated = formatDate(project.updatedAt)
            return (
              <li key={project.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="hover:underline"
                      >
                        {project.name}
                      </Link>
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{project.team.name}</Badge>
                      <span>{t`Updated ${updated}`}</span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="grid max-w-xl gap-2 rounded-lg border border-dashed p-6">
          <h2 className="text-lg font-medium">{t`No project yet`}</h2>
          <p className="text-muted-foreground">
            {t`A project holds one research question: what you want to learn, why, and your hypotheses. Studies and their evidence will attach to it.`}
          </p>
        </div>
      )}
    </div>
  )
}
