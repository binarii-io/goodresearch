import { useGetProjectOverview, useGetProjectOverviewCosts } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PencilIcon } from '@goodresearch/ui/components/icons'
import { JourneyStep, JourneySteps } from '@goodresearch/ui/components/journey'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useCanChange } from '../workspace/read-only.tsx'

/** Read again on each visit: decisions are made on the other screens (spec 017 US1). */
export const useProjectOverview = (projectId: string) =>
  useGetProjectOverview(projectId, { query: { refetchOnMount: 'always' } })

/** Apart from the counts, which never wait for them. */
export const useProjectCosts = (projectId: string) =>
  useGetProjectOverviewCosts(projectId, { query: { refetchOnMount: 'always' } })

/** Spec 017 US1: where the research stands, and the next step. */
export function ProjectJourney({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const canChange = useCanChange()
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
      <Link
        to="/studies/$studyId"
        params={{ studyId: only.id }}
        search={{ phase, from: projectId }}
      />
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
  const first = steps.find((s) => s.key === 'interviews')
  const surveys = first?.key === 'interviews' && first.kinds.surveys

  return (
    <nav aria-label={t`Progress of the research`}>
      <JourneySteps>
        {steps.map((step, index) => {
          // Spec 026: readers see where it stands; what to do next is the team's.
          const isNext = canChange && step.key === nextStep
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
                render={tabLink(
                  step.state === 'done' || !canChange ? 'debrief' : 'recommendations',
                )}
              />
            )
          if (step.key === 'interviews') {
            const toValidate = number(step.toDecide)
            // Named after the kinds of study the project holds (spec 028): a survey has responses.
            const surveysOnly = step.kinds.surveys && !step.kinds.interviews
            const mixed = step.kinds.surveys && step.kinds.interviews
            const responses = plural(step.responses, {
              one: '# response counted',
              other: '# responses counted',
            })
            return (
              <JourneyStep
                key={step.key}
                {...shared}
                label={surveysOnly ? t`Responses` : mixed ? t`Fieldwork` : t`Interviews`}
                value={number(surveysOnly ? step.responses : step.total)}
                dimmed={step.total + step.received === 0 && !isNext}
                action={
                  !isNext
                    ? undefined
                    : studies.length === 0
                      ? t`Create a first study`
                      : open.length === 0
                        ? t`Ask for access to a study's folder`
                        : surveysOnly
                          ? step.received > 0
                            ? t`Check the target audience`
                            : t`Collect the responses of a survey`
                          : step.total === 0 && !mixed
                            ? t`Add the interviews to a study`
                            : step.total === 0
                              ? t`Add interviews or collect responses`
                              : t`Validate the interviews`
                }
                detail={
                  surveysOnly
                    ? step.received > step.responses
                      ? plural(step.received, { one: '# received', other: '# received' })
                      : undefined
                    : step.total + step.responses === 0
                      ? undefined
                      : [
                          ...(step.total
                            ? [
                                plural(step.participants, {
                                  one: '# participant',
                                  other: '# participants',
                                }),
                                step.toDecide > 0 ? t`${toValidate} to validate` : t`All validated`,
                              ]
                            : []),
                          ...(mixed ? [responses] : []),
                        ].join(' · ')
                }
                render={studyLink(canChange ? 'fieldwork' : 'analysis')}
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
              from:
                step.key === 'facts' && surveys
                  ? t`Will come from the studies`
                  : t`Will come from the interviews`,
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
