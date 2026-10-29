import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useGetProject,
  useMoveProject,
  useRenameProject,
  useUpdateProjectGoal,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { UsersIcon } from '@goodresearch/ui/components/icons'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { PageBar } from '@goodresearch/ui/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@goodresearch/ui/components/tabs'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { z } from 'zod'
import { StudyList } from '../../../features/research/study-list.tsx'
import { InsightsTab } from '../../../features/synthesis/insights-tab.tsx'
import { RecommendationsTab } from '../../../features/synthesis/recommendations-tab.tsx'
import { errorCode, errorMessage } from '../../../features/workspace/errors.ts'
import { useFormatDate } from '../../../features/workspace/format.ts'
import { useMe } from '../../../features/workspace/me.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  // Spec 013: the project's tabs, Overview (goal and studies) and Insights.
  validateSearch: z.object({
    tab: z.enum(['overview', 'insights', 'recommendations']).optional().catch(undefined),
  }),
  component: ProjectOverview,
})

function ProjectOverview() {
  const { t, i18n } = useLingui()
  const { projectId } = Route.useParams()
  const { tab = 'overview' } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useMe()
  const project = useGetProject(projectId)
  const rename = useRenameProject()
  const updateGoal = useUpdateProjectGoal()
  const move = useMoveProject()
  const formatDate = useFormatDate()
  const teamLabel = useId()
  const [error, setError] = useState<unknown>(null)

  if (project.isPending) return <Skeleton className="h-40 w-full" />
  if (errorCode(project.error) === 'PROJECT_NOT_FOUND' || !project.data) return <NotFound />
  const p = project.data

  /** Saves through a mutation; keeps the field open on error and explains conflicts (FR-020). */
  const save = async (run: () => Promise<unknown>) => {
    setError(null)
    try {
      await run()
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })
    } catch (failure) {
      setError(failure)
      throw failure
    }
  }

  const conflict = errorCode(error) === 'VERSION_CONFLICT'
  const created = formatDate(p.createdAt)
  const updated = formatDate(p.updatedAt)

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        void navigate({
          to: '.',
          search: (previous) => ({ ...previous, tab: value === 'overview' ? undefined : value }),
        })
      }
      className="gap-4"
    >
      <PageBar
        back={<Link to="/" />}
        backLabel={t`Back to research projects`}
        crumbs={[<Link key="projects" to="/">{t`Projects`}</Link>]}
        title={
          <InlineEdit
            label={t`Project name`}
            value={p.name}
            maxLength={120}
            savedMessage={t`Name saved`}
            editHint={t`Enter to save, Escape to cancel`}
            onSave={(name) =>
              save(() => rename.mutateAsync({ projectId, data: { name, version: p.version } }))
            }
          />
        }
        right={
          <TabsList aria-label={t`Project views`}>
            <TabsTrigger value="overview">{t`Overview`}</TabsTrigger>
            <TabsTrigger value="insights">{t`Insights`}</TabsTrigger>
            <TabsTrigger value="recommendations">{t`Recommendations`}</TabsTrigger>
          </TabsList>
        }
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive p-3 text-sm"
        >
          <span>{errorMessage(i18n, error)}</span>
          {conflict ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null)
                void project.refetch()
              }}
            >
              {t`Reload`}
            </Button>
          ) : null}
        </div>
      ) : null}

      <TabsContent value="overview" className="grid gap-4">
        <section
          aria-labelledby="goal-heading"
          className="grid gap-3 rounded-lg border bg-[radial-gradient(circle_at_100%_0,color-mix(in_srgb,var(--highlight)_20%,transparent)_0_70px,transparent_71px),linear-gradient(120deg,var(--card)_62%,var(--highlight-soft))] px-[26px] pt-[22px] pb-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="goal-heading" className="eyebrow">
              {t`Research goal`}
            </h2>
            <span id={teamLabel} className="sr-only">
              {t`Team`}
            </span>
            <Select
              value={p.team.id}
              onValueChange={(teamId) => {
                if (!teamId || teamId === p.team.id) return
                void save(() =>
                  move.mutateAsync({ projectId, data: { teamId, version: p.version } }),
                ).catch(() => undefined)
              }}
            >
              <SelectTrigger
                aria-labelledby={teamLabel}
                className="h-auto rounded-full bg-card px-3 py-1.5 font-medium"
              >
                <UsersIcon aria-hidden />
                <SelectValue>{() => p.team.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {me.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-w-[900px] text-[1.02rem] leading-relaxed">
            <InlineEdit
              label={t`Research goal`}
              value={p.goal}
              multiline
              maxLength={10_000}
              placeholder={t`Describe the research question, objectives and hypotheses.`}
              savedMessage={t`Goal saved`}
              editHint={t`Ctrl+Enter to save, Escape to cancel`}
              onSave={(goal) =>
                save(() =>
                  updateGoal.mutateAsync({ projectId, data: { goal, version: p.version } }),
                )
              }
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {t`Created ${created} · Updated ${updated}`}
          </p>
        </section>

        <StudyList projectId={projectId} />
      </TabsContent>
      <TabsContent value="insights">
        <InsightsTab projectId={projectId} />
      </TabsContent>
      <TabsContent value="recommendations">
        <RecommendationsTab projectId={projectId} />
      </TabsContent>
    </Tabs>
  )
}
