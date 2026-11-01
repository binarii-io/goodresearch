import { useGetProjectOverview, useGetProjectOverviewCosts } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PencilIcon } from '@goodresearch/ui/components/icons'
import { JourneyStep, JourneySteps } from '@goodresearch/ui/components/journey'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'

/** Read again on each visit: decisions are made on the other screens (spec 017 US1). */
export const useProjectOverview = (projectId: string) =>
  useGetProjectOverview(projectId, { query: { refetchOnMount: 'always' } })

/** Apart from the counts, which never wait for them. */
export const useProjectCosts = (projectId: string) =>
  useGetProjectOverviewCosts(projectId, { query: { refetchOnMount: 'always' } })

/** Spec 017 US1: where the research stands, and the next step. */
export function ProjectJourney({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const overview = useProjectOverview(projectId)

  if (overview.isPending) return <Skeleton className="h-32 w-full" />
  if (!overview.data)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
        <span>{t`The state of the research could not be loaded.`}</span>
        <Button size="sm" variant="outline" onClick={() => void overview.refetch()}>
          {t`Retry`}
        </Button>
      </div>
    )

  const { steps, nextStep, studies } = overview.data
  // A study whose folder is closed is neither counted nor opened from here (spec 002).
  const open = studies.filter((s) => s.access)
  const only = open.length === 1 ? open[0] : undefined
  /** One study opens at the phase; with several, or none, the choice is in the Studies section. */
  const studyLink = (phase: 'fieldwork' | 'analysis') =>
    only ? (
      <Link to="/studies/$studyId" params={{ studyId: only.id }} search={{ phase }} />
    ) : (
      // Focus follows, so a keyboard reaches the Studies section in one activation (SC-002).
      <Link
        to="."
        hash="studies-heading"
        onClick={() => document.getElementById('studies-heading')?.focus()}
      />
    )
  const tabLink = (tab: 'insights' | 'recommendations' | 'debrief') => (
    <Link to="." search={(previous) => ({ ...previous, tab })} />
  )
  const number = (n: number) => i18n.number(n)

  return (
    <nav aria-label={t`Progress of the research`}>
      <JourneySteps>
        {steps.map((step, index) => {
          const isNext = step.key === nextStep
          const shared = { number: index + 1, next: isNext ? t`Next step` : undefined }
          if (step.key === 'debrief')
            return (
              <JourneyStep
                key={step.key}
                {...shared}
                label={t`Debrief`}
                value={
                  step.state === 'done' ? (
                    <CheckIcon aria-hidden className="size-6" />
                  ) : (
                    <PencilIcon aria-hidden className="size-5 text-muted-foreground" />
                  )
                }
                action={isNext ? t`Write the key takeaways` : undefined}
                detail={
                  isNext
                    ? undefined
                    : step.state === 'done'
                      ? t`Key takeaways written`
                      : t`Key takeaways to write`
                }
                // The takeaways are written on Recommendations; the Debrief tab reads them.
                render={tabLink(step.state === 'done' ? 'debrief' : 'recommendations')}
              />
            )
          if (step.key === 'interviews') {
            const toValidate = number(step.toDecide)
            return (
              <JourneyStep
                key={step.key}
                {...shared}
                label={t`Interviews`}
                value={number(step.total)}
                dimmed={step.total === 0 && !isNext}
                action={
                  !isNext
                    ? undefined
                    : studies.length === 0
                      ? t`Create a first study`
                      : open.length === 0
                        ? t`Ask for access to a study's folder`
                        : step.total === 0
                          ? t`Add the interviews to a study`
                          : t`Validate the interviews`
                }
                detail={
                  step.total === 0
                    ? undefined
                    : [
                        plural(step.participants, {
                          one: '# participant',
                          other: '# participants',
                        }),
                        step.toDecide > 0 ? t`${toValidate} to validate` : t`All validated`,
                      ].join(' · ')
                }
                render={studyLink('fieldwork')}
              />
            )
          }
          const left = step.toDecide
          const labels = {
            facts: {
              label: t`Facts`,
              find: t`Find the facts of the interviews`,
              decide: plural(left, {
                one: 'Decide the # fact left',
                other: 'Decide the # facts left',
              }),
              from: t`Will come from the interviews`,
              all: t`All validated`,
              validated: plural(step.validated, { one: '# validated', other: '# validated' }),
              bar: t`Facts validated`,
            },
            insights: {
              label: t`Insights`,
              find: t`Find insights`,
              decide: plural(left, {
                one: 'Decide the # insight left',
                other: 'Decide the # insights left',
              }),
              from: t`Will come from the facts`,
              all: t`All validated`,
              validated: plural(step.validated, { one: '# validated', other: '# validated' }),
              bar: t`Insights validated`,
            },
            recommendations: {
              label: t`Recommendations`,
              find: t`Find recommendations`,
              decide: plural(left, {
                one: 'Decide the # recommendation left',
                other: 'Decide the # recommendations left',
              }),
              from: t`Will come from the insights`,
              all: t`All validated`,
              // Feminine in French, unlike facts and insights.
              validated: t({
                context: 'recommendations',
                message: plural(step.validated, { one: '# validated', other: '# validated' }),
              }),
              bar: t`Recommendations validated`,
            },
          }[step.key]
          return (
            <JourneyStep
              key={step.key}
              {...shared}
              label={labels.label}
              value={number(step.total)}
              dimmed={step.total === 0 && !isNext}
              action={isNext ? (step.total === 0 ? labels.find : labels.decide) : undefined}
              detail={
                step.total === 0
                  ? isNext
                    ? undefined
                    : labels.from
                  : left === 0
                    ? labels.all
                    : labels.validated
              }
              progress={
                step.total > 0
                  ? { value: step.validated, max: step.total, label: labels.bar }
                  : undefined
              }
              render={step.key === 'facts' ? studyLink('analysis') : tabLink(step.key)}
            />
          )
        })}
      </JourneySteps>
    </nav>
  )
}
