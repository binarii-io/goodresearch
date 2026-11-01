import { getListTeamStudiesQueryKey, useCreateTeamStudy } from '@goodresearch/api-client'
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
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'

/** Spec 021: a study of the team, in no project; it can be attached to one later. */
export function CreateTeamStudyDialog({ teamId }: { teamId: string }) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useCreateTeamStudy()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [touched, setTouched] = useState(false)
  const ids = { name: useId(), nameError: useId(), goal: useId() }
  const missing = touched && name.trim().length === 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (name.trim().length === 0) return
    const { id } = await create.mutateAsync({ teamId, data: { name, goal } })
    await queryClient.invalidateQueries({ queryKey: getListTeamStudiesQueryKey(teamId) })
    setOpen(false)
    await navigate({
      to: '/studies/$studyId',
      params: { studyId: id },
      search: { from: 'team' },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>{t`New study`}</DialogTrigger>
      <DialogContent closeLabel={t`Close`}>
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="grid gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t`New study`}</DialogTitle>
            <DialogDescription>{t`An interview study of this team, in no project for now. You can link it to a project later.`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={ids.name}>{t`Name`}</Label>
            <Input
              id={ids.name}
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? ids.nameError : undefined}
            />
            {missing ? (
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
              placeholder={t`What must this study learn?`}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
          {create.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, create.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {t`Create study`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
