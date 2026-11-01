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
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatDate } from '../workspace/format.ts'
import { CostBreakdown } from './cost-breakdown.tsx'
import { useProjectCosts, useProjectOverview } from './project-journey.tsx'

/** Studies of a project, on the project overview (spec 002 FR-004). */
export function StudyList({ projectId }: { projectId: string }) {
  const { t } = useLingui()
  const studies = useListStudies(projectId)
  const overview = useProjectOverview(projectId)
  const projectCosts = useProjectCosts(projectId)
  const costs = projectCosts.data
  const cost = costs?.cost
  const hidden = overview.data?.hiddenStudies ?? 0
  const formatDate = useFormatDate()

  return (
    <section className="grid gap-3" aria-labelledby="studies-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle
          id="studies-heading"
          tabIndex={-1}
          count={studies.data?.length}
          className="mt-4 outline-none"
        >
          {t`Studies`}
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
          {cost && (cost.total !== 0 || (studies.data?.length ?? 0) > 0) ? (
            <CostBreakdown
              label={(amount) => t`AI cost of the project: ${amount}`}
              total={cost.total}
              uses={[
                { label: t`Studies`, cost: cost.studies },
                { label: t`Insights`, cost: cost.insights },
                { label: t`Recommendations`, cost: cost.recommendations },
                { label: t`Key takeaways`, cost: cost.takeaways },
              ]}
            />
          ) : null}
          {projectCosts.isError ? (
            <span className="flex items-center gap-2" role="alert">
              {t`The AI cost could not be loaded.`}
              <Button size="sm" variant="outline" onClick={() => void projectCosts.refetch()}>
                {t`Retry`}
              </Button>
            </span>
          ) : null}
          <CreateStudyDialog projectId={projectId} />
        </div>
      </div>
      {hidden > 0 ? (
        <p className="text-muted-foreground text-sm">
          {plural(hidden, {
            one: 'The counts leave out # study whose folder you cannot open; the AI cost of the project includes it.',
            other:
              'The counts leave out # studies whose folder you cannot open; the AI cost of the project includes them.',
          })}
        </p>
      ) : null}
      {studies.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : studies.data?.length ? (
        <ul className="grid gap-2" aria-label={t`Studies`}>
          {studies.data.map((study) => {
            const updated = formatDate(study.updatedAt)
            const folder = study.folderName
            const seen = overview.data?.studies.find((s) => s.id === study.id)
            const studyCost = costs?.studies.find((s) => s.id === study.id)?.cost
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
                  {seen?.counts ? <StudyChips counts={seen.counts} /> : null}
                  {/* Spec 017 US2: a closed study shows its name and type; its page asks for access. */}
                  {seen?.access === false ? null : (
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderOpenIcon aria-hidden className="size-3.5" />
                        {folder ? folder : study.hasFolder ? t`Folder attached` : t`No folder yet`}
                      </span>
                      <span>{t`Updated ${updated}`}</span>
                      {studyCost ? (
                        <CostBreakdown
                          label={(amount) => t`AI cost: ${amount}`}
                          total={studyCost.total}
                          uses={[
                            { label: t`Analysis`, cost: studyCost.analysis },
                            { label: t`Lexicon`, cost: studyCost.lexicon },
                            { label: t`Cleaning`, cost: studyCost.cleaning },
                            { label: t`Quality`, cost: studyCost.quality },
                            { label: t`Facts`, cost: studyCost.facts },
                          ]}
                        />
                      ) : null}
                    </p>
                  )}
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

/** Spec 017 US2: what a study holds and what waits for a person; nothing to report is left out. */
function StudyChips({
  counts: c,
}: {
  counts: {
    validated: number
    toValidate: number
    excluded: number
    facts: number
    factsToDecide: number
  }
}) {
  const { t, i18n } = useLingui()
  const toValidate = i18n.number(c.toValidate)
  if (c.validated + c.toValidate + c.excluded === 0)
    return <p className="text-muted-foreground text-sm">{t`No interview yet`}</p>
  return (
    <p className="flex flex-wrap gap-1.5">
      {c.validated > 0 ? (
        <Badge className="bg-polarity-positive text-foreground">
          {plural(c.validated, { one: '# interview validated', other: '# interviews validated' })}
        </Badge>
      ) : null}
      {c.toValidate > 0 ? <Badge variant="highlight">{t`${toValidate} to validate`}</Badge> : null}
      {c.excluded > 0 ? (
        <Badge variant="secondary">
          {plural(c.excluded, { one: '# excluded', other: '# excluded' })}
        </Badge>
      ) : null}
      {c.facts > 0 ? (
        <Badge variant="secondary">{plural(c.facts, { one: '# fact', other: '# facts' })}</Badge>
      ) : null}
      {c.factsToDecide > 0 ? (
        <Badge variant="highlight">
          {plural(c.factsToDecide, { one: '# fact to decide', other: '# facts to decide' })}
        </Badge>
      ) : null}
    </p>
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
