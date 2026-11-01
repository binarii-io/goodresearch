import {
  getGetProjectQueryKey,
  type ProjectDeletion,
  useDeleteProject,
  useGetProjectDeletion,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@goodresearch/ui/components/dialog'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'

/** Nothing of a deleted project stays in the cache, for a Back to show it again. */
export const forgetProject = (queryClient: QueryClient, projectId: string) =>
  queryClient.removeQueries({
    predicate: (query) => query.queryKey.join('/').includes(projectId),
  })

/** Spec 020: what goes for good and what stays, in the dialog and on the assistant's card. */
export function DeletionSummary({ deletion: d }: { deletion: ProjectDeletion }) {
  const { t } = useLingui()
  return (
    <div className="grid gap-2 text-sm">
      <div>
        <p className="font-medium">{t`Deleted for good, with no way back:`}</p>
        <ul className="ml-5 list-disc">
          <li>{t`The project and its research goal`}</li>
          {d.insights > 0 ? (
            <li>{plural(d.insights, { one: '# insight', other: '# insights' })}</li>
          ) : null}
          {d.recommendations > 0 ? (
            <li>
              {plural(d.recommendations, { one: '# recommendation', other: '# recommendations' })}
            </li>
          ) : null}
          {d.hasTakeaways ? <li>{t`The key takeaways`}</li> : null}
          {d.hasPublishedDeck ? (
            <li>{t`The link to the published debrief: the file stays in Drive`}</li>
          ) : null}
        </ul>
      </div>
      <div>
        <p className="font-medium">{t`What stays:`}</p>
        <ul className="ml-5 list-disc">
          <li>
            {plural(d.studies, {
              0: 'No study to keep',
              one: '# study, with its interviews and facts',
              other: '# studies, with their interviews and facts',
            })}
          </li>
          {d.studiesWithoutProject > 0 ? (
            <li>
              {plural(d.studiesWithoutProject, {
                one: "# will be in no project, on the team's Studies page",
                other: "# will be in no project, on the team's Studies page",
              })}
            </li>
          ) : null}
          <li>{t`Files in Drive and AI costs already recorded`}</li>
        </ul>
      </div>
    </div>
  )
}

/** The name stands apart from the label: one click selects it, to copy it into the field. */
export function NameToType({ name, field }: { name: string; field: string }) {
  const { t } = useLingui()
  return (
    <div className="grid gap-1">
      <Label htmlFor={field}>{t`Type the project's name to confirm:`}</Label>
      <p className="w-fit max-w-full select-all rounded-sm bg-muted px-1.5 py-0.5 font-medium text-sm break-words">
        {name}
      </p>
    </div>
  )
}

export function DeleteProjectDialog({ projectId, name }: { projectId: string; name: string }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remove = useDeleteProject()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const field = useId()
  const deletion = useGetProjectDeletion(projectId, {
    query: { enabled: open, staleTime: 0, gcTime: 0 },
  })

  const confirm = async () => {
    try {
      await remove.mutateAsync({ projectId, data: { name: typed } })
    } catch (failure) {
      // Renamed by someone else: the name shown here is out of date.
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) })
      throw failure
    }
    setOpen(false)
    await navigate({ to: '/' })
    forgetProject(queryClient, projectId)
    await queryClient.invalidateQueries()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setTyped('')
        remove.reset()
      }}
    >
      <DialogTrigger
        render={<Button variant="destructive" />}
      >{t`Delete the project`}</DialogTrigger>
      <DialogContent closeLabel={t`Close`}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void confirm().catch(() => undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t`Delete this project?`}</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          {deletion.data ? (
            <DeletionSummary deletion={deletion.data} />
          ) : deletion.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, deletion.error)}
            </p>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
          <div className="grid gap-2">
            <NameToType name={name} field={field} />
            <Input
              id={field}
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {remove.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, remove.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={remove.isPending || !deletion.data || typed.trim() !== name}
            >
              {t`Delete for good`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
