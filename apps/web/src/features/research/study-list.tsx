import { getListStudiesQueryKey, useCreateStudy, useListStudies } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
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
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'

/** Studies of a project, on the project overview (spec 002 FR-004). */
export function StudyList({ projectId }: { projectId: string }) {
  const { t } = useLingui()
  const studies = useListStudies(projectId)
  const formatDate = useFormatDate()

  return (
    <section className="grid gap-3" aria-labelledby="studies-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="studies-heading" className="text-lg font-medium">
          {t`Studies`}
        </h2>
        <CreateStudyDialog projectId={projectId} />
      </div>
      {studies.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : studies.data?.length ? (
        <ul className="grid gap-2" aria-label={t`Studies`}>
          {studies.data.map((study) => {
            const updated = formatDate(study.updatedAt)
            const folder = study.folderName
            return (
              <li
                key={study.id}
                className="flex flex-wrap items-center gap-3 rounded-md border p-3"
              >
                <Link
                  to="/studies/$studyId"
                  params={{ studyId: study.id }}
                  className="font-medium hover:underline"
                >
                  {study.name}
                </Link>
                <Badge variant="secondary">{t`Interviews`}</Badge>
                <span className="text-muted-foreground text-sm">
                  {folder
                    ? t`Folder: ${folder}`
                    : study.hasFolder
                      ? t`Folder attached`
                      : t`No folder yet`}{' '}
                  · {t`Updated ${updated}`}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t`No study yet. A study collects evidence for this project, for example a series of interviews.`}</p>
      )}
    </section>
  )
}

function CreateStudyDialog({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createStudy = useCreateStudy()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const ids = { name: useId(), nameError: useId(), type: useId() }
  const missing = touched && name.trim().length === 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (name.trim().length === 0) return
    const { id } = await createStudy.mutateAsync({ projectId, data: { name, type: 'interviews' } })
    await queryClient.invalidateQueries({ queryKey: getListStudiesQueryKey(projectId) })
    setOpen(false)
    await navigate({ to: '/studies/$studyId', params: { studyId: id } })
  }

  const types = [
    { value: 'interviews', label: t`Interviews`, available: true },
    { value: 'survey', label: t`Survey`, available: false },
    { value: 'usability-test', label: t`Usability test`, available: false },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>{t`New study`}</DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => void submit(e).catch(() => undefined)}
          className="grid gap-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{t`New study`}</DialogTitle>
            <DialogDescription>{t`A study is one way of collecting evidence for the project's research question.`}</DialogDescription>
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
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t`Type`}</legend>
            <RadioGroup defaultValue="interviews">
              {types.map((type) => (
                <div key={type.value} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={type.value}
                    id={`${ids.type}-${type.value}`}
                    disabled={!type.available}
                  />
                  <Label htmlFor={`${ids.type}-${type.value}`}>
                    {type.label}
                    {type.available ? null : (
                      <span className="text-muted-foreground"> — {t`coming later`}</span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {createStudy.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(i18n, createStudy.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={createStudy.isPending}>
              {t`Create study`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
