import {
  getGetInsightQueryOptions,
  type InsightCard,
  type InsightsOverview,
  useGetInsights,
  useStopInsightRun,
  useValidateInsights,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  CheckIcon,
  LoaderCircleIcon,
  PlusIcon,
  SparklesIcon,
  SquareIcon,
} from '@goodresearch/ui/components/icons'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@goodresearch/ui/components/sheet'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { FactsPanel } from './facts-panel.tsx'
import { InsightCardView } from './insight-card.tsx'
import { InsightPanel, useRefreshInsights } from './insight-panel.tsx'
import { InsightRunDialog } from './insight-run-dialog.tsx'
import { CONFIDENCES, INSIGHT_FAILURES, INSIGHT_POLARITIES, INSIGHT_STATUSES } from './labels.ts'
import { NewInsightDialog } from './new-insight-dialog.tsx'

const ALL = 'all'
const running = (data: InsightsOverview | undefined) => !!data?.run && !data.run.finished

/** Spec 013 FR-001: the project's insights, by theme, with the run, the costs and the facts. */
export function InsightsTab({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const refresh = useRefreshInsights(projectId)
  const [theme, setTheme] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [confidence, setConfidence] = useState(ALL)
  const [polarity, setPolarity] = useState(ALL)
  const [finding, setFinding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [factsOpen, setFactsOpen] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const overview = useGetInsights(
    projectId,
    {
      ...(theme !== ALL ? { theme } : {}),
      ...(status !== ALL ? { status: status as InsightCard['status'] } : {}),
      ...(confidence !== ALL
        ? { confidence: confidence as InsightCard['confidence']['level'] }
        : {}),
      ...(polarity !== ALL ? { polarity: polarity as InsightCard['polarity'] } : {}),
    },
    {
      query: {
        refetchOnMount: 'always',
        refetchInterval: (query) => (running(query.state.data) ? 2000 : false),
      },
    },
  )
  const stop = useStopInsightRun()
  const validate = useValidateInsights()
  const queryClient = useQueryClient()
  const data = overview.data
  if (overview.isPending) return <Skeleton className="h-40 w-full" />
  if (!data) return <p role="alert">{errorMessage(i18n, overview.error)}</p>
  const live = running(data)
  const run = data.run
  const toDecide = data.insights.filter((i) => i.status === 'proposed')
  const total = data.counts.proposed + data.counts.validated + data.counts.rejected
  const ordered = data.themes.flatMap((th) => data.insights.filter((i) => i.theme.key === th.key))
  // The insight chosen while it is shown; otherwise the first one (opened by default).
  const selected =
    chosen && ordered.some((i) => i.id === chosen) ? chosen : (ordered[0]?.id ?? null)
  const groups = data.themes
    .map((th) => ({ theme: th, insights: data.insights.filter((i) => i.theme.key === th.key) }))
    .filter((g) => g.insights.length > 0)
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-lg">
          {t`Insights`} <span className="text-muted-foreground">{total}</span>
        </h2>
        <span className="text-muted-foreground text-sm">
          {data.lastRunCost === null
            ? t`Total cost ${money(data.cost ?? 0)}`
            : t`Last run ${money(data.lastRunCost)} · total ${money(data.cost ?? 0)}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setFactsOpen(true)}>
            {data.factsToDecide > 0
              ? t`Facts (${data.facts} accepted, ${data.factsToDecide} to validate)`
              : t`Facts (${data.facts})`}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.facts === 0}
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden />
            {t`New insight`}
          </Button>
          <Button
            size="sm"
            disabled={live || data.facts + data.factsToDecide === 0}
            onClick={() => setFinding(true)}
          >
            <SparklesIcon aria-hidden />
            {t`Find insights`}
          </Button>
        </div>
      </div>

      {data.facts + data.factsToDecide === 0 ? (
        <p className="rounded-md border p-4 text-sm">
          {t`No accepted fact yet. Facts are found and accepted in the Analysis phase of each study of the project.`}
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
              <span>
                {run.stopping
                  ? t`Stopping after the current call…`
                  : t`Finding insights: call ${run.callsDone} of ${run.calls || '…'}`}
              </span>
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
          {t`${run.leftOut} insights of the last run were left out: no known fact, a name or a percentage, or already rejected.`}
        </p>
      ) : null}

      {total > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <Choice
            label={t`Theme`}
            value={theme}
            className="w-52"
            onChange={setTheme}
            options={[
              { value: ALL, label: t`All themes` },
              ...data.themes.map((x) => ({ value: x.key, label: x.title ?? t`Other` })),
            ]}
          />
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
            label={t`Confidence`}
            value={confidence}
            className="w-44"
            onChange={setConfidence}
            options={[
              { value: ALL, label: t`All` },
              ...Object.entries(CONFIDENCES).map(([value, label]) => ({
                value,
                label: i18n._(label),
              })),
            ]}
          />
          <Choice
            label={t`Polarity`}
            value={polarity}
            className="w-36"
            onChange={setPolarity}
            options={[
              { value: ALL, label: t`All` },
              ...Object.entries(INSIGHT_POLARITIES).map(([value, label]) => ({
                value,
                label: i18n._(label),
              })),
            ]}
          />
        </div>
      ) : null}

      {groups.length > 0 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid gap-4">
            {groups.map((g) => (
              <section
                key={g.theme.key}
                aria-label={g.theme.title ?? t`Other`}
                className="grid gap-2"
              >
                <h3 className="eyebrow">{g.theme.title ?? t`Other`}</h3>
                <ul className="grid gap-2">
                  {g.insights.map((i) => (
                    <li key={i.id}>
                      <InsightCardView
                        insight={i}
                        selected={i.id === selected}
                        onSelect={() => setChosen(i.id)}
                        onPreview={() =>
                          void queryClient.prefetchQuery({
                            ...getGetInsightQueryOptions(projectId, i.id),
                            // Once per half a minute: hovering again sends nothing (review of PR #14).
                            staleTime: 30_000,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {toDecide.length > 0 ? (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={validate.isPending}
                  onClick={() =>
                    void validate
                      .mutateAsync({
                        projectId,
                        data: { insights: toDecide.map((i) => ({ id: i.id, version: i.version })) },
                      })
                      .then(async (r) => {
                        await refresh()
                        if (r.changed > 0)
                          toast.info(t`${r.changed} insights changed meanwhile: check them again.`)
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
          {selected ? (
            <InsightPanel projectId={projectId} insightId={selected} themes={data.themes} />
          ) : null}
        </div>
      ) : null}
      {total > 0 && groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t`No insight matches these filters.`}</p>
      ) : null}

      <InsightRunDialog
        projectId={projectId}
        open={finding}
        onOpenChange={setFinding}
        hasInsights={total > 0}
      />
      <NewInsightDialog
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
        themes={data.themes}
      />
      <Sheet open={factsOpen} onOpenChange={setFactsOpen}>
        <SheetContent closeLabel={t`Close`} className="w-full overflow-y-auto p-4 sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle>{t`Accepted facts`}</SheetTitle>
            <SheetDescription>
              {t`The facts accepted in the studies of the project. Open an insight to link them.`}
            </SheetDescription>
          </SheetHeader>
          <FactsPanel projectId={projectId} themes={data.themes} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
