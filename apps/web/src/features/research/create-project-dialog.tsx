import { getListProjectsQueryKey, type TeamRef, useCreateProject } from '@goodresearch/api-client'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, type ReactElement, type ReactNode, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'

/** `trigger` replaces the default button (sidebar shortcut, "New project" card); `children` is its content. */
export function CreateProjectDialog({
  teams,
  defaultTeamId,
  trigger = <Button />,
  children,
}: {
  teams: TeamRef[]
  defaultTeamId?: string | undefined
  trigger?: ReactElement
  children?: ReactNode
}) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createProject = useCreateProject()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [teamId, setTeamId] = useState<string | undefined>(
    defaultTeamId ?? (teams.length === 1 ? teams[0]?.id : undefined),
  )
  const [touched, setTouched] = useState(false)
  const ids = {
    name: useId(),
    goal: useId(),
    team: useId(),
    nameError: useId(),
    teamError: useId(),
    error: useId(),
  }
  const nameMissing = touched && name.trim().length === 0
  const teamMissing = touched && !teamId

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (name.trim().length === 0 || !teamId) return
    const { id } = await createProject.mutateAsync({ data: { name, goal, teamId } })
    await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })
    setOpen(false)
    await navigate({ to: '/projects/$projectId', params: { projectId: id } })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger}>{children ?? t`New project`}</DialogTrigger>
      <DialogContent closeLabel={t`Close`}>
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="grid gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t`New project`}</DialogTitle>
            <DialogDescription>{t`A project holds one research question and belongs to a team.`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={ids.name}>{t`Name`}</Label>
            <Input
              id={ids.name}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameMissing || undefined}
              aria-describedby={nameMissing ? ids.nameError : undefined}
            />
            {nameMissing ? (
              <p id={ids.nameError} className="text-destructive text-sm">
                {t`Enter a name.`}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={ids.goal}>{t`Research goal`}</Label>
            <Textarea
              id={ids.goal}
              value={goal}
              maxLength={10_000}
              placeholder={t`Question, objectives, hypotheses`}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label id={ids.team}>{t`Team`}</Label>
            <Select value={teamId ?? null} onValueChange={(value) => setTeamId(value ?? undefined)}>
              <SelectTrigger
                aria-labelledby={ids.team}
                aria-invalid={teamMissing || undefined}
                aria-describedby={teamMissing ? ids.teamError : undefined}
              >
                <SelectValue placeholder={t`Choose a team`}>
                  {(value: string | null) =>
                    teams.find((team) => team.id === value)?.name ?? t`Choose a team`
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teamMissing ? (
              <p id={ids.teamError} className="text-destructive text-sm">
                {t`Choose a team.`}
              </p>
            ) : null}
          </div>
          {createProject.isError ? (
            <p id={ids.error} role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, createProject.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={createProject.isPending}>
              {t`Create project`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
