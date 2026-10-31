import {
  getGetRecommendationQueryOptions,
  type RecommendationCard,
  type RecommendationsOverview,
  useGetRecommendations,
  useStopRecommendationRun,
  useValidateRecommendations,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  LoaderCircleIcon,
  PlusIcon,
  SparklesIcon,
  SquareIcon,
} from '@goodresearch/ui/components/icons'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { INSIGHT_FAILURES, INSIGHT_STATUSES, RATINGS, REC_KINDS } from './labels.ts'
import { NewRecommendationDialog } from './new-recommendation-dialog.tsx'
import { RecommendationCardView } from './recommendation-card.tsx'
import { RecommendationMatrix } from './recommendation-matrix.tsx'
import { RecommendationPanel, useRefreshRecommendations } from './recommendation-panel.tsx'
import { RecommendationRunDialog } from './recommendation-run-dialog.tsx'
import { Takeaways } from './takeaways.tsx'

const ALL = 'all'
const running = (data: RecommendationsOverview | undefined) =>
  (!!data?.run && !data.run.finished) || data?.takeaways.draft.state === 'drafting'

/** Spec 014 FR-001: key takeaways, then the recommendations in two panes. */
export function RecommendationsTab({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const refresh = useRefreshRecommendations(projectId)
  const [status, setStatus] = useState(ALL)
  const [kind, setKind] = useState(ALL)
  const [priority, setPriority] = useState(ALL)
  const [finding, setFinding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const overview = useGetRecommendations(
    projectId,
    {
      ...(status !== ALL ? { status: status as RecommendationCard['status'] } : {}),
      ...(kind !== ALL ? { kind: kind as RecommendationCard['kind'] } : {}),
      ...(priority !== ALL ? { priority: priority as 'high' | 'medium' | 'low' } : {}),
    },
    {
      query: {
        refetchOnMount: 'always',
        refetchInterval: (query) => (running(query.state.data) ? 2000 : false),
      },
    },
  )
  const stop = useStopRecommendationRun()
  const validate = useValidateRecommendations()
  const queryClient = useQueryClient()
  /** Loads a recommendation's details on hover, so opening it shows them at once. */
  const preview = (id: string) =>
    void queryClient.prefetchQuery({
      ...getGetRecommendationQueryOptions(projectId, id),
      // Once per half a minute: hovering again sends nothing (review of PR #14).
      staleTime: 30_000,
    })
  const data = overview.data
  if (overview.isPending) return <Skeleton className="h-40 w-full" />
  if (!data) return <p role="alert">{errorMessage(i18n, overview.error)}</p>
  const run = data.run
  const live = !!run && !run.finished
  const shown = data.recommendations
  const selected = chosen && shown.some((r) => r.id === chosen) ? chosen : (shown[0]?.id ?? null)
  const toDecide = shown.filter((r) => r.status === 'proposed')
  const total = data.counts.proposed + data.counts.validated + data.counts.rejected
  const readable = data.insights + data.insightsToDecide
  return (
    <div className="grid gap-4">
      <Takeaways
        projectId={projectId}
        takeaways={data.takeaways}
        consentNeeded={data.consentNeeded}
        validated={data.insights}
        toDecide={data.insightsToDecide}
      />
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-lg">
          {t`Recommendations`} <span className="text-muted-foreground">{total}</span>
        </h2>
        <span className="text-muted-foreground text-sm">
          {data.lastRunCost === null
            ? t`Total cost ${money(data.cost ?? 0)}`
            : t`Last run ${money(data.lastRunCost)} · total ${money(data.cost ?? 0)}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {total > 0 ? (
            <Segmented aria-label={t`View`}>
              <SegmentedItem pressed={view === 'list'} onClick={() => setView('list')}>
                {t`List`}
              </SegmentedItem>
              <SegmentedItem pressed={view === 'matrix'} onClick={() => setView('matrix')}>
                {t`Matrix`}
              </SegmentedItem>
            </Segmented>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={data.insights === 0}
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden />
            {t`New recommendation`}
          </Button>
          <Button size="sm" disabled={live || readable === 0} onClick={() => setFinding(true)}>
            <SparklesIcon aria-hidden />
            {t`Find recommendations`}
          </Button>
        </div>
      </div>

      {readable === 0 ? (
        <p className="rounded-md border p-4 text-sm">
          {t`No insight yet. Insights are found and validated in the Insights tab of the project.`}
        </p>
      ) : null}

      {run && (live || run.failure) ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
        >
          {live ? (
            <>
              <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              <span>{run.stopping ? t`Stopping…` : t`Finding recommendations…`}</span>
              <Button
                size="xs"
                variant="outline"
                disabled={run.stopping || stop.isPending}
                onClick={() =>
                  void stop
                    .mutateAsync({ projectId, runId: run.id })
                    .then(() => refresh())
                    .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                }
              >
                <SquareIcon aria-hidden />
                {t`Stop`}
              </Button>
            </>
          ) : run.failure ? (
            <span>{i18n._(INSIGHT_FAILURES[run.failure])}</span>
          ) : null}
        </div>
      ) : null}
      {run?.finished && run.leftOut > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t`${run.leftOut} recommendations of the last run were left out: no known insight, a name, or already rejected.`}
        </p>
      ) : null}

      {total > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <Choice
            label={t`Status`}
            value={status}
            className="w-36"
            onChange={setStatus}
            options={[
              { value: ALL, label: t`All` },
              ...(['proposed', 'validated', 'rejected'] as const).map((s) => ({
                value: s,
                label: i18n._(INSIGHT_STATUSES[s]),
              })),
            ]}
          />
          <Choice
            label={t`Kind`}
            value={kind}
            className="w-40"
            onChange={setKind}
            options={[
              { value: ALL, label: t`All` },
              ...Object.entries(REC_KINDS).map(([value, label]) => ({
                value,
                label: i18n._(label),
              })),
            ]}
          />
          <Choice
            label={t`Priority`}
            value={priority}
            className="w-36"
            onChange={setPriority}
            options={[
              { value: ALL, label: t`All` },
              ...Object.entries(RATINGS).map(([value, label]) => ({ value, label: i18n._(label) })),
            ]}
          />
        </div>
      ) : null}

      {shown.length > 0 ? (
        <div
          className={`grid items-start gap-4 ${view === 'matrix' ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'}`}
        >
          {view === 'matrix' ? (
            <RecommendationMatrix
              projectId={projectId}
              recommendations={shown}
              selected={selected}
              onSelect={setChosen}
              onPreview={preview}
            />
          ) : (
            <div className="grid gap-2">
              <ul className="grid gap-2">
                {shown.map((r) => (
                  <li key={r.id}>
                    <RecommendationCardView
                      recommendation={r}
                      selected={r.id === selected}
                      onSelect={() => setChosen(r.id)}
                      onPreview={() => preview(r.id)}
                    />
                  </li>
                ))}
              </ul>
              {toDecide.length > 0 ? (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={validate.isPending}
                    onClick={() =>
                      void validate
                        .mutateAsync({
                          projectId,
                          data: {
                            recommendations: toDecide.map((r) => ({
                              id: r.id,
                              version: r.version,
                            })),
                          },
                        })
                        .then(async (res) => {
                          await refresh()
                          if (res.changed > 0)
                            toast.info(
                              t`${res.changed} recommendations changed meanwhile: check them again.`,
                            )
                          if (res.blocked > 0)
                            toast.info(
                              t`${res.blocked} recommendations rest only on insights still to decide: validate their insights first.`,
                            )
                        })
                        .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
                    }
                  >
                    <CheckIcon aria-hidden />
                    {t`Validate all shown (${toDecide.length})`}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          {selected ? (
            <RecommendationPanel projectId={projectId} recommendationId={selected} />
          ) : null}
        </div>
      ) : total > 0 ? (
        <p className="text-muted-foreground text-sm">{t`No recommendation matches these filters.`}</p>
      ) : null}

      <RecommendationRunDialog projectId={projectId} open={finding} onOpenChange={setFinding} />
      <NewRecommendationDialog projectId={projectId} open={creating} onOpenChange={setCreating} />
    </div>
  )
}
