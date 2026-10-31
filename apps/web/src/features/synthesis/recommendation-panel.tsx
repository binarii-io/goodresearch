import {
  getGetInsightsQueryKey,
  getGetRecommendationQueryKey,
  getGetRecommendationsQueryKey,
  getListInsightsToLinkQueryKey,
  type RecommendationDetail,
  useDecideInsight,
  useDecideRecommendation,
  useEditRecommendation,
  useGetRecommendation,
  useLinkInsight,
  useMarkRecommendationReviewed,
  useRetryRecommendationTranslation,
  useUnlinkInsight,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PlusIcon, SparklesIcon, XIcon } from '@goodresearch/ui/components/icons'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useBilingual } from './insight-card.tsx'
import { InsightsPicker } from './insights-picker.tsx'
import { CONFIDENCES, LINKED_INSIGHTS, RATINGS, REC_KINDS } from './labels.ts'

/** Refreshes what a recommendation change shows: the tab, the recommendation, the insights. */
export const useRefreshRecommendations = (projectId: string) => {
  const queryClient = useQueryClient()
  return async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetRecommendationsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: getListInsightsToLinkQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: getGetInsightsQueryKey(projectId) }),
      id
        ? queryClient.invalidateQueries({ queryKey: getGetRecommendationQueryKey(projectId, id) })
        : undefined,
    ])
  }
}

type Text = 'action' | 'rationale' | 'successMeasure'

/**
 * FR-007, FR-009, FR-014: the recommendation selected, in the right pane: edited in place,
 * decided, with the insights it rests on. Keyed by recommendation.
 */
export function RecommendationPanel({
  projectId,
  recommendationId,
}: {
  projectId: string
  recommendationId: string
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const lang = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const refresh = useRefreshRecommendations(projectId)
  // The one shown stays while the next loads: the pane changes in place, without a flash.
  const detail = useGetRecommendation(projectId, recommendationId, {
    query: { placeholderData: keepPreviousData },
  })
  const switching = detail.isPlaceholderData
  const decide = useDecideRecommendation()
  const edit = useEditRecommendation()
  const link = useLinkInsight()
  const unlink = useUnlinkInsight()
  const reviewed = useMarkRecommendationReviewed()
  const retry = useRetryRecommendationTranslation()
  const decideInsight = useDecideInsight()
  const [adding, setAdding] = useState(false)
  // Another one selected: nothing of the previous one stays open.
  useEffect(() => setAdding(false), [recommendationId])
  const r = detail.data
  const busy =
    switching ||
    decide.isPending ||
    edit.isPending ||
    link.isPending ||
    unlink.isPending ||
    reviewed.isPending ||
    decideInsight.isPending
  const done = (p: Promise<unknown>) =>
    void p
      .then(() => refresh(recommendationId))
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  /** Saves one change; rethrows to keep an inline edit open. */
  const save = async (x: RecommendationDetail, change: Record<string, unknown>) => {
    try {
      await edit.mutateAsync({
        projectId,
        recommendationId: x.id,
        data: { version: x.version, ...change },
      })
      await refresh(recommendationId)
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
      throw failure
    }
  }
  const saveText = (x: RecommendationDetail, field: Text, value: string) =>
    save(x, { [field]: { [lang]: value } })
  const changed = r
    ? r.links.filter(
        (l) =>
          l.state === 'counted' &&
          (l.insight === 'rejected' || l.insight === 'deleted' || l.insight === 'changed'),
      ).length
    : 0
  const validated = r?.status === 'validated' || r?.status === 'edited'
  const ratings = Object.entries(RATINGS).map(([value, label]) => ({ value, label: i18n._(label) }))
  return (
    <section
      aria-label={t`Recommendation selected`}
      aria-busy={switching}
      className={`grid content-start gap-4 rounded-lg border bg-card p-4 transition-opacity duration-150 lg:sticky lg:top-20 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto ${switching ? 'opacity-60' : ''}`}
    >
      {!r ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        // Keyed by what is shown: its edits in place start fresh when the next one comes.
        <Fragment key={r.id}>
          <header className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{i18n._(REC_KINDS[r.kindShown])}</Badge>
                {r.downgraded ? (
                  <span className="text-muted-foreground text-xs">{t`Build shown as a test: its insights all have a low confidence.`}</span>
                ) : null}
                {r.translation === 'translating' ? (
                  <span className="text-muted-foreground text-xs">{t`Translating…`}</span>
                ) : null}
              </div>
              <fieldset className="flex gap-1">
                <legend className="sr-only">{t`Decision`}</legend>
                <Button
                  size="sm"
                  variant={validated ? 'default' : 'outline'}
                  aria-pressed={validated}
                  disabled={busy}
                  onClick={() =>
                    validated
                      ? undefined
                      : done(
                          decide.mutateAsync({
                            projectId,
                            recommendationId: r.id,
                            data: { version: r.version, decision: 'validate' },
                          }),
                        )
                  }
                >
                  <CheckIcon aria-hidden />
                  {validated ? t`Validated` : t`Validate`}
                </Button>
                <Button
                  size="sm"
                  variant={r.status === 'rejected' ? 'default' : 'outline'}
                  aria-pressed={r.status === 'rejected'}
                  disabled={busy}
                  onClick={() =>
                    r.status === 'rejected'
                      ? undefined
                      : done(
                          decide.mutateAsync({
                            projectId,
                            recommendationId: r.id,
                            data: { version: r.version, decision: 'reject' },
                          }),
                        )
                  }
                >
                  <XIcon aria-hidden />
                  {r.status === 'rejected' ? t`Rejected` : t`Reject`}
                </Button>
              </fieldset>
            </div>
            <div className="font-semibold text-lg leading-snug">
              <InlineEdit
                label={t`Action`}
                value={bilingual(r.action, r.translation).text}
                maxLength={200}
                savedMessage={t`Action saved`}
                editHint={t`Enter to save, Escape to cancel`}
                onSave={(v) => saveText(r, 'action', v)}
              />
            </div>
          </header>
          {r.translation === 'not-translated' ? (
            <p className="text-sm">
              {t`Not translated into the other language.`}{' '}
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  done(
                    retry.mutateAsync({
                      projectId,
                      recommendationId: r.id,
                      data: { version: r.version },
                    }),
                  )
                }
              >
                <SparklesIcon aria-hidden />
                {t`Translate again`}
              </Button>
            </p>
          ) : null}
          <StatTiles className="lg:grid-flow-row lg:grid-cols-2 xl:grid-cols-4">
            <StatTile label={t`Priority`} value={r.priority} detail={t`impact × 2 − effort`} />
            <StatTile label={t`Kind`} value={i18n._(REC_KINDS[r.kindShown])} />
            <StatTile label={t`Impact`} value={i18n._(RATINGS[r.impact])} />
            <StatTile label={t`Effort`} value={i18n._(RATINGS[r.effort])} />
          </StatTiles>
          <div className="flex flex-wrap items-end gap-3">
            <Choice
              label={t`Kind`}
              value={r.kind}
              className="w-40"
              onChange={(v) => void save(r, { kind: v }).catch(() => undefined)}
              options={Object.entries(REC_KINDS).map(([value, label]) => ({
                value,
                label: i18n._(label),
              }))}
            />
            <Choice
              label={t`Impact`}
              value={r.impact}
              className="w-32"
              onChange={(v) => void save(r, { impact: v }).catch(() => undefined)}
              options={ratings}
            />
            <Choice
              label={t`Effort`}
              value={r.effort}
              className="w-32"
              onChange={(v) => void save(r, { effort: v }).catch(() => undefined)}
              options={ratings}
            />
          </div>
          <div className="grid gap-3">
            {(
              [
                ['rationale', t`Rationale`, 1000],
                ['successMeasure', t`Success measure`, 300],
              ] as const
            ).map(([field, label, max]) => (
              <section
                key={field}
                aria-label={label}
                className="grid gap-1 rounded-md bg-muted/50 p-3"
              >
                <h4 className="eyebrow">{label}</h4>
                <InlineEdit
                  label={label}
                  value={bilingual(r[field], r.translation).text}
                  multiline
                  maxLength={max}
                  placeholder={t`Nothing yet`}
                  savedMessage={t`Saved`}
                  editHint={t`Ctrl+Enter to save, Escape to cancel`}
                  onSave={(v) => saveText(r, field, v)}
                />
              </section>
            ))}
            <section aria-label={t`Owner`} className="grid gap-1 rounded-md bg-muted/50 p-3">
              <h4 className="eyebrow">{t`Owner`}</h4>
              <InlineEdit
                label={t`Owner`}
                value={r.owner ?? ''}
                maxLength={100}
                placeholder={t`A role or a team`}
                savedMessage={t`Saved`}
                editHint={t`Enter to save, Escape to cancel`}
                onSave={(v) => save(r, { owner: v.trim() || null })}
              />
            </section>
          </div>
          {changed > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span>{t`Insights changed (${changed}): some insights changed or were rejected since this recommendation was decided.`}</span>
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  done(
                    reviewed.mutateAsync({
                      projectId,
                      recommendationId: r.id,
                      data: { version: r.version },
                    }),
                  )
                }
              >
                {t`Reviewed`}
              </Button>
            </div>
          ) : null}
          <section aria-labelledby={`rec-insights-${r.id}`} className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id={`rec-insights-${r.id}`} className="font-medium">
                {t`Insights`}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
                <PlusIcon aria-hidden />
                {adding ? t`Hide the insights` : t`Link insights`}
              </Button>
            </div>
            {adding ? (
              <InsightsPicker
                projectId={projectId}
                actions={(i) => {
                  const linked = r.links.some((l) => l.insightId === i.id && l.state === 'counted')
                  return (
                    <Button
                      size="xs"
                      variant={linked ? 'secondary' : 'outline'}
                      disabled={busy || linked}
                      onClick={() =>
                        done(
                          link.mutateAsync({
                            projectId,
                            recommendationId: r.id,
                            insightId: i.id,
                            data: { version: r.version },
                          }),
                        )
                      }
                    >
                      {linked ? t`Linked` : t`Link`}
                    </Button>
                  )
                }}
              />
            ) : null}
            <ul className="grid gap-2">
              {r.links
                .filter((l) => l.state !== 'unlinked')
                .map((l) => (
                  <li key={l.insightId} className="grid gap-1.5 rounded-md border p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {l.state === 'suggested' ? (
                        <Badge variant="outline">{t`Suggested`}</Badge>
                      ) : null}
                      {l.insight !== 'validated' ? (
                        <Badge variant="outline">{i18n._(LINKED_INSIGHTS[l.insight])}</Badge>
                      ) : null}
                      {l.level ? (
                        <Badge variant="ghost">{i18n._(CONFIDENCES[l.level])}</Badge>
                      ) : null}
                      {l.theme ? <Badge variant="ghost">{l.theme.title ?? t`Other`}</Badge> : null}
                    </div>
                    <p className="text-sm">
                      {l.statement ? bilingual(l.statement).text : t`This insight was deleted.`}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId }}
                        search={{ tab: 'insights' }}
                        className="text-xs underline underline-offset-2"
                      >
                        {t`See in the insights`}
                      </Link>
                      <div className="flex gap-1">
                        {l.state === 'suggested' ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              done(
                                link.mutateAsync({
                                  projectId,
                                  recommendationId: r.id,
                                  insightId: l.insightId,
                                  data: { version: r.version },
                                }),
                              )
                            }
                          >
                            <CheckIcon aria-hidden />
                            {t`Accept`}
                          </Button>
                        ) : null}
                        {l.insight === 'to-decide' && l.version !== null ? (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                done(
                                  decideInsight.mutateAsync({
                                    projectId,
                                    insightId: l.insightId,
                                    data: { version: l.version ?? 0, decision: 'validate' },
                                  }),
                                )
                              }
                            >
                              <CheckIcon aria-hidden />
                              {t`Validate the insight`}
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                done(
                                  decideInsight.mutateAsync({
                                    projectId,
                                    insightId: l.insightId,
                                    data: { version: l.version ?? 0, decision: 'reject' },
                                  }),
                                )
                              }
                            >
                              <XIcon aria-hidden />
                              {t`Reject the insight`}
                            </Button>
                          </>
                        ) : null}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            done(
                              unlink.mutateAsync({
                                projectId,
                                recommendationId: r.id,
                                insightId: l.insightId,
                                params: { version: r.version },
                              }),
                            )
                          }
                        >
                          <XIcon aria-hidden />
                          {l.state === 'suggested' ? t`Dismiss` : t`Unlink`}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        </Fragment>
      )}
    </section>
  )
}
