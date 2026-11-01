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
import { AttachStudyDialog } from './attach-study-dialog.tsx'
import { CostBreakdown } from './cost-breakdown.tsx'
import { DetachStudyDialog } from './detach-study-dialog.tsx'
import { useProjectCosts, useProjectOverview } from './project-journey.tsx'
import { StudyCard } from './study-card.tsx'

/** Studies of a project, on the project overview (spec 002 FR-004). */
export function StudyList({ projectId, teamId }: { projectId: string; teamId: string }) {
  const { t } = useLingui()
  const studies = useListStudies(projectId)
  const overview = useProjectOverview(projectId)
  const projectCosts = useProjectCosts(projectId)
  const costs = projectCosts.data
  const cost = costs?.cost
  const hidden = overview.data?.hiddenStudies ?? 0

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
          <AttachStudyDialog projectId={projectId} teamId={teamId} />
          <CreateStudyDialog projectId={projectId} />
        </div>
      </div>
      {studies.data?.some((s) => s.alsoIn.length > 0) ? (
        <p className="text-muted-foreground text-sm">{t`The AI cost includes studies shared with other projects: it counts in each of them.`}</p>
      ) : null}
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
            const seen = overview.data?.studies.find((s) => s.id === study.id)
            const studyCost = costs?.studies.find((s) => s.id === study.id)?.cost
            return (
              <StudyCard
                key={study.id}
                study={study}
                search={{ from: projectId }}
                closed={seen?.access === false}
                counts={seen?.counts}
                cost={studyCost}
                note={
                  study.alsoIn.length ? (
                    <p className="text-muted-foreground text-sm">
                      {t`Also in ${study.alsoIn.map((p) => p.name).join(', ')}`}
                    </p>
                  ) : null
                }
                actions={<DetachStudyDialog projectId={projectId} study={study} />}
              />
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
    await navigate({
      to: '/studies/$studyId',
      params: { studyId: id },
      search: { from: projectId },
    })
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
