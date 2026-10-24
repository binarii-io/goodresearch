import { getGetMeQueryKey, getListTeamsQueryKey, useCreateTeam } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from './errors.ts'

/** Team creation form, used for the first team and on the teams screen. */
export function CreateTeamForm({
  onCreated,
  submitLabel,
}: {
  onCreated?: () => void
  submitLabel: string
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const createTeam = useCreateTeam()
  const [name, setName] = useState('')
  const id = useId()
  const errorId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await createTeam.mutateAsync({ data: { name } })
    setName('')
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() })
    await queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() })
    onCreated?.()
  }

  return (
    <form
      onSubmit={(e) => void submit(e).catch(() => undefined)}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="grid gap-2">
        <Label htmlFor={id}>{t`Team name`}</Label>
        <Input
          id={id}
          value={name}
          required
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={createTeam.isError || undefined}
          aria-describedby={createTeam.isError ? errorId : undefined}
        />
      </div>
      <Button type="submit" disabled={createTeam.isPending || name.trim().length === 0}>
        {submitLabel}
      </Button>
      {createTeam.isError ? (
        <p id={errorId} role="alert" className="text-destructive basis-full text-sm">
          {errorMessage(i18n, createTeam.error)}
        </p>
      ) : null}
    </form>
  )
}
