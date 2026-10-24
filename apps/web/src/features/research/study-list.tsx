import { getListStudiesQueryKey, useCreateStudy, useListStudies } from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@goodresearch/ui/components/dialog'
import { ArrowRightIcon, FolderOpenIcon } from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { sky } from '@goodresearch/ui/lib/sky'
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
        <SectionTitle id="studies-heading" count={studies.data?.length} className="mt-4">
          {t`Studies`}
        </SectionTitle>
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
                className="relative grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 rounded-lg border bg-card px-[18px] py-4 transition-shadow hover:border-input hover:shadow-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-solid"
              >
                <div
                  aria-hidden
                  className="size-[52px] rounded-[12px]"
                  style={{ background: sky(study.id) }}
                />
                <div className="grid min-w-0 gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Badge variant="secondary">{t`Interviews`}</Badge>
                    <Link
                      to="/studies/$studyId"
                      params={{ studyId: study.id }}
                      className="truncate text-[1.05rem] font-semibold outline-none focus-visible:shadow-none after:absolute after:inset-0 after:rounded-lg"
                    >
                      {study.name}
                    </Link>
                    <ArrowRightIcon
                      aria-hidden
                      className="ml-auto size-4 shrink-0 text-muted-foreground"
                    />
                  </div>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
                    <span className="inline-flex items-center gap-1.5">
                      <FolderOpenIcon aria-hidden className="size-3.5" />
                      {folder ? folder : study.hasFolder ? t`Folder attached` : t`No folder yet`}
                    </span>
                    <span>{t`Updated ${updated}`}</span>
                  </p>
                </div>
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
      <DialogContent closeLabel={t`Close`}>
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
