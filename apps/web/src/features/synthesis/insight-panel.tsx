import {
  getGetInsightQueryKey,
  getGetInsightsQueryKey,
  getListInsightFactsQueryKey,
  type InsightDetail,
  type InsightLink,
  useDecideFact,
  useDecideInsight,
  useEditInsight,
  useGetInsight,
  useLinkFact,
  useMarkInsightReviewed,
  useRetryInsightTranslation,
  useUnlinkFact,
} from '@goodresearch/api-client'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import { CheckIcon, PlusIcon, XIcon } from '@goodresearch/ui/components/icons'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { StatTile, StatTiles } from '@goodresearch/ui/components/stat-tile'
import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { POLARITIES } from '../analysis/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { FactSource, FactsPanel } from './facts-panel.tsx'
import { ConfidenceBadge, PolarityBadge, useBilingual } from './insight-card.tsx'
import { CONFIDENCE_LEVELS, LINKED_FACTS } from './labels.ts'

/** Refreshes what an insight change shows: the tab, the insight, the facts panel. */
export const useRefreshInsights = (projectId: string) => {
  const queryClient = useQueryClient()
  return async (insightId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetInsightsQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: getListInsightFactsQueryKey(projectId) }),
      insightId
        ? queryClient.invalidateQueries({ queryKey: getGetInsightQueryKey(projectId, insightId) })
        : undefined,
    ])
  }
}

type Field = 'statement' | 'description' | 'counterEvidence' | 'minorityView'

/** FR-014: the facts grouped by participant, each with its role and its state now. */
function Links({
  insight,
  onRole,
  onUnlink,
  onDecideFact,
  busy,
}: {
  insight: InsightDetail
  onRole: (link: InsightLink, role: 'support' | 'counter') => void
  onUnlink: (link: InsightLink) => void
  /** A fact still to decide, decided from here (spec 013, update). */
  onDecideFact: (link: InsightLink, decision: 'accept' | 'reject') => void
  busy: boolean
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const shown = insight.links.filter((l) => l.state !== 'unlinked')
  const groups = new Map<string, InsightLink[]>()
  for (const l of shown) {
    const who = l.participant ?? t`Participant not identified`
    groups.set(who, [...(groups.get(who) ?? []), l])
  }
  if (shown.length === 0)
    return <p className="text-muted-foreground text-sm">{t`No fact linked.`}</p>
  return (
    <div className="grid gap-3">
      {[...groups].map(([who, links]) => (
        <section key={who} aria-label={who} className="grid gap-2">
          <h4 className="font-medium text-sm">{who}</h4>
          <ul className="grid gap-2">
            {links.map((l) => (
              <li key={l.factId} className="grid gap-1.5 rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={l.role === 'support' ? 'secondary' : 'outline'}>
                    {l.role === 'support' ? t`Supports` : t`Goes against`}
                  </Badge>
                  {l.state === 'suggested' ? <Badge variant="outline">{t`Suggested`}</Badge> : null}
                  {l.fact !== 'accepted' ? (
                    <Badge variant="outline">{i18n._(LINKED_FACTS[l.fact])}</Badge>
                  ) : null}
                  {l.polarity ? (
                    <Badge variant="ghost">{i18n._(POLARITIES[l.polarity])}</Badge>
                  ) : null}
                </div>
                <p className="text-sm">
                  {l.statement
                    ? bilingual(l.statement).text
                    : l.fact === 'deleted'
                      ? t`This fact was deleted.`
                      : t`From a study you cannot open`}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {l.studyId && l.sessionId ? (
                    <FactSource
                      fact={{
                        studyId: l.studyId,
                        sessionId: l.sessionId,
                        participant: l.participant,
                      }}
                    />
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-1">
                    {l.state === 'suggested' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onRole(l, l.role)}
                      >
                        <CheckIcon aria-hidden />
                        {t`Accept`}
                      </Button>
                    ) : null}
                    {l.state !== 'suggested' && l.fact === 'to-decide' && l.version !== null ? (
                      <>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onDecideFact(l, 'accept')}
                        >
                          <CheckIcon aria-hidden />
                          {t`Accept the fact`}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() => onDecideFact(l, 'reject')}
                        >
                          <XIcon aria-hidden />
                          {t`Reject the fact`}
                        </Button>
                      </>
                    ) : null}
                    {l.state !== 'suggested' &&
                    (l.fact === 'accepted' || l.fact === 'changed' || l.fact === 'to-decide') ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onRole(l, l.role === 'support' ? 'counter' : 'support')}
                      >
                        {l.role === 'support' ? t`Move to against` : t`Move to support`}
                      </Button>
                    ) : null}
                    <Button size="xs" variant="ghost" disabled={busy} onClick={() => onUnlink(l)}>
                      <XIcon aria-hidden />
                      {l.state === 'suggested' ? t`Dismiss` : t`Unlink`}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * FR-010, FR-012, FR-014: the insight selected, in the right pane of the tab: to read, edit and
 * decide, with its facts. Keyed by insight: another one starts with nothing in edition.
 */
export function InsightPanel({
  projectId,
  insightId,
  themes,
}: {
  projectId: string
  insightId: string
  themes: readonly { key: string; title: string | null }[]
}) {
  const { t, i18n } = useLingui()
  const bilingual = useBilingual()
  const fr = i18n.locale.startsWith('fr')
  const refresh = useRefreshInsights(projectId)
  // The one shown stays while the next loads: the pane changes in place, without a flash.
  const detail = useGetInsight(projectId, insightId, {
    query: { placeholderData: keepPreviousData },
  })
  const switching = detail.isPlaceholderData
  const decide = useDecideInsight()
  const edit = useEditInsight()
  const link = useLinkFact()
  const unlink = useUnlinkFact()
  const reviewed = useMarkInsightReviewed()
  const retry = useRetryInsightTranslation()
  const decideFact = useDecideFact()
  const [adding, setAdding] = useState(false)
  // Another one selected: nothing of the previous one stays open.
  useEffect(() => setAdding(false), [insightId])
  const i = detail.data
  const busy =
    switching ||
    decide.isPending ||
    edit.isPending ||
    link.isPending ||
    unlink.isPending ||
    reviewed.isPending ||
    decideFact.isPending
  const done = (p: Promise<unknown>) =>
    void p
      .then(() => refresh(insightId))
      .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
  const lang = fr ? 'fr' : 'en'
  /** Saves one text in the viewer's language (the other is translated); rethrows to keep it open. */
  const save = async (
    x: InsightDetail,
    change: Partial<Record<Field, string>> & { themeKey?: string },
  ) => {
    const { themeKey, ...texts } = change
    try {
      await edit.mutateAsync({
        projectId,
        insightId: x.id,
        data: {
          version: x.version,
          ...(themeKey ? { themeKey } : {}),
          ...Object.fromEntries(Object.entries(texts).map(([f, v]) => [f, { [lang]: v }])),
        },
      })
      await refresh(insightId)
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
      throw failure
    }
  }
  const decideIt = (x: InsightDetail, decision: 'validate' | 'reject') =>
    done(decide.mutateAsync({ projectId, insightId: x.id, data: { version: x.version, decision } }))
  // FR-012: facts that changed, left or were rejected since; a fact still to validate is none.
  const changed = i
    ? i.links.filter(
        (l) => l.state === 'counted' && l.fact !== 'accepted' && l.fact !== 'to-decide',
      ).length
    : 0
  return (
    <section
      aria-label={t`Insight selected`}
      aria-busy={switching}
      className={`grid content-start gap-4 rounded-lg border bg-card p-4 transition-opacity duration-150 lg:sticky lg:top-20 lg:max-h-[calc(100svh-8rem)] lg:overflow-y-auto ${switching ? 'opacity-60' : ''}`}
    >
      {!i ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        // Keyed by what is shown: its edits in place start fresh when the next one comes.
        <Fragment key={i.id}>
          <header className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <ConfidenceBadge confidence={i.confidence} />
                <PolarityBadge polarity={i.polarity} />
                {i.translation === 'translating' ? (
                  <span className="text-muted-foreground text-xs">{t`Translating…`}</span>
                ) : null}
              </div>
              {/* The decision stays in view: the choice made is highlighted. */}
              <fieldset className="flex gap-1">
                <legend className="sr-only">{t`Decision`}</legend>
                <Button
                  size="sm"
                  variant={
                    i.status === 'validated' || i.status === 'edited' ? 'default' : 'outline'
                  }
                  aria-pressed={i.status === 'validated' || i.status === 'edited'}
                  disabled={busy}
                  onClick={() =>
                    i.status === 'validated' || i.status === 'edited'
                      ? undefined
                      : decideIt(i, 'validate')
                  }
                >
                  <CheckIcon aria-hidden />
                  {i.status === 'validated' || i.status === 'edited' ? t`Validated` : t`Validate`}
                </Button>
                <Button
                  size="sm"
                  variant={i.status === 'rejected' ? 'default' : 'outline'}
                  aria-pressed={i.status === 'rejected'}
                  disabled={busy}
                  onClick={() => (i.status === 'rejected' ? undefined : decideIt(i, 'reject'))}
                >
                  <XIcon aria-hidden />
                  {i.status === 'rejected' ? t`Rejected` : t`Reject`}
                </Button>
              </fieldset>
            </div>
            <div className="font-semibold text-lg leading-snug">
              <InlineEdit
                label={t`Statement`}
                value={bilingual(i.statement, i.translation).text}
                maxLength={200}
                savedMessage={t`Statement saved`}
                editHint={t`Enter to save, Escape to cancel`}
                onSave={(v) => save(i, { statement: v })}
              />
            </div>
            <Choice
              label={t`Theme`}
              value={i.theme.key}
              className="w-72"
              onChange={(key) => {
                if (key !== i.theme.key) void save(i, { themeKey: key }).catch(() => undefined)
              }}
              options={themes.map((x) => ({ value: x.key, label: x.title ?? t`Other` }))}
            />
          </header>
          {i.translation === 'not-translated' ? (
            <p className="text-sm">
              {t`Not translated into the other language.`}{' '}
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  done(
                    retry.mutateAsync({ projectId, insightId: i.id, data: { version: i.version } }),
                  )
                }
              >
                {t`Translate again`}
              </Button>
            </p>
          ) : null}
          <StatTiles className="lg:grid-flow-row lg:grid-cols-4">
            <StatTile
              label={t`For`}
              value={i.confidence.support}
              detail={
                i.confidence.pendingSupport > 0
                  ? t`+${i.confidence.pendingSupport} to validate`
                  : t`participants`
              }
            />
            <StatTile
              label={t`Against`}
              value={i.confidence.counter}
              detail={
                i.confidence.pendingCounter > 0
                  ? t`+${i.confidence.pendingCounter} to validate`
                  : t`participants`
              }
            />
            <StatTile
              label={t`Confidence`}
              value={
                <span className="inline-block first-letter:uppercase">
                  {i18n._(CONFIDENCE_LEVELS[i.confidence.level])}
                </span>
              }
              detail={
                i.confidence.pendingSupport + i.confidence.pendingCounter > 0
                  ? t`Once validated: ${i18n._(CONFIDENCE_LEVELS[i.confidence.levelIfAccepted])}`
                  : i.confidence.level === 'high'
                    ? null
                    : t`High from ${i.confidence.highAt}`
              }
            />
            <StatTile
              label={t`Panel`}
              value={i.confidence.panel}
              detail={
                i.confidence.panelIfAccepted > i.confidence.panel
                  ? t`+${i.confidence.panelIfAccepted - i.confidence.panel} to validate`
                  : t`participants`
              }
            />
          </StatTiles>
          <div className="grid gap-3">
            {(
              [
                ['description', t`Description`, 1000],
                ['counterEvidence', t`Counter-evidence`, 500],
                ['minorityView', t`Minority view`, 500],
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
                  value={bilingual(i[field], i.translation).text}
                  multiline
                  maxLength={max}
                  placeholder={t`Nothing yet`}
                  savedMessage={t`Saved`}
                  editHint={t`Ctrl+Enter to save, Escape to cancel`}
                  onSave={(v) => save(i, { [field]: v })}
                />
              </section>
            ))}
          </div>
          {changed > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <span>{t`Evidence changed (${changed}): some facts changed or left since this insight was decided.`}</span>
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  done(
                    reviewed.mutateAsync({
                      projectId,
                      insightId: i.id,
                      data: { version: i.version },
                    }),
                  )
                }
              >
                {t`Reviewed`}
              </Button>
            </div>
          ) : null}
          <section aria-labelledby={`facts-${i.id}`} className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id={`facts-${i.id}`} className="font-medium">
                {t`Facts`}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
                <PlusIcon aria-hidden />
                {adding ? t`Hide the facts` : t`Link facts`}
              </Button>
            </div>
            {adding ? (
              <FactsPanel
                projectId={projectId}
                themes={themes}
                actions={(f) => {
                  const linked = i.links.find((l) => l.factId === f.id && l.state !== 'unlinked')
                  return (['support', 'counter'] as const).map((role) => (
                    <Button
                      key={role}
                      size="xs"
                      variant={
                        linked?.role === role && linked.state === 'counted'
                          ? 'secondary'
                          : 'outline'
                      }
                      disabled={busy || !f.statement}
                      onClick={() =>
                        done(
                          link.mutateAsync({
                            projectId,
                            insightId: i.id,
                            factId: f.id,
                            data: { version: i.version, role },
                          }),
                        )
                      }
                    >
                      {role === 'support' ? t`Supports` : t`Goes against`}
                    </Button>
                  ))
                }}
              />
            ) : null}
            <Links
              insight={i}
              busy={busy}
              onRole={(l, role) =>
                done(
                  link.mutateAsync({
                    projectId,
                    insightId: i.id,
                    factId: l.factId,
                    data: { version: i.version, role },
                  }),
                )
              }
              onDecideFact={(l, decision) => {
                if (!l.studyId || l.version === null) return
                done(
                  decideFact.mutateAsync({
                    studyId: l.studyId,
                    factId: l.factId,
                    data: { decision, version: l.version },
                  }),
                )
              }}
              onUnlink={(l) =>
                done(
                  unlink.mutateAsync({
                    projectId,
                    insightId: i.id,
                    factId: l.factId,
                    params: { version: i.version },
                  }),
                )
              }
            />
          </section>
        </Fragment>
      )}
    </section>
  )
}
