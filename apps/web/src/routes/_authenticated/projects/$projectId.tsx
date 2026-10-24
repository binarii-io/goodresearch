import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useGetProject,
  useMoveProject,
  useRenameProject,
  useUpdateProjectGoal,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
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
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { StudyList } from '../../../features/research/study-list.tsx'
import { errorCode, errorMessage } from '../../../features/workspace/errors.ts'
import { useFormatDate } from '../../../features/workspace/format.ts'
import { useMe } from '../../../features/workspace/me.ts'
import { NotFound } from '../../../features/workspace/not-found.tsx'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectOverview,
})

function ProjectOverview() {
  const { t, i18n } = useLingui()
  const { projectId } = Route.useParams()
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
    <article className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold">
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
        </h1>
        <p className="text-muted-foreground text-sm">
          {t`Created ${created} · Updated ${updated}`}
        </p>
      </header>

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

      <section className="grid gap-2" aria-labelledby="goal-heading">
        <h2 id="goal-heading" className="text-lg font-medium">
          {t`Research goal`}
        </h2>
        <InlineEdit
          label={t`Research goal`}
          value={p.goal}
          multiline
          maxLength={10_000}
          placeholder={t`Describe the research question, objectives and hypotheses.`}
          savedMessage={t`Goal saved`}
          editHint={t`Ctrl+Enter to save, Escape to cancel`}
          onSave={(goal) =>
            save(() => updateGoal.mutateAsync({ projectId, data: { goal, version: p.version } }))
          }
        />
      </section>

      <section className="grid max-w-xs gap-2">
        <Label id={teamLabel}>{t`Team`}</Label>
        <Select
          value={p.team.id}
          onValueChange={(teamId) => {
            if (!teamId || teamId === p.team.id) return
            void save(() =>
              move.mutateAsync({ projectId, data: { teamId, version: p.version } }),
            ).catch(() => undefined)
          }}
        >
          <SelectTrigger aria-labelledby={teamLabel}>
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
      </section>

      <StudyList projectId={projectId} />
    </article>
  )
}
