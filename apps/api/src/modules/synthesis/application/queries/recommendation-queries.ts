import { err, fold, ok } from '@goodresearch/shared'
import {
  isRunLive,
  type RecommendationRun,
  recommendationsRef,
  recommendationTranslationRef,
  takeawaysRef,
  takeawaysTranslationRef,
} from '../../domain/insight-run.ts'
import {
  insightsChanged,
  kindShown,
  linkStateOf,
  priority,
  type Recommendation,
} from '../../domain/recommendations.ts'
import { outOfDate, toValidate } from '../../domain/takeaways.ts'
import { type InsightLine, insightsNow } from '../insights-now.ts'
import type { SynthesisDeps } from '../ports.ts'
import { projectOf } from '../project.ts'
import { basisOf, blankTakeaways } from '../takeaways-basis.ts'

type Filters = {
  status?: 'proposed' | 'validated' | 'edited' | 'rejected' | undefined
  kind?: 'build' | 'test' | 'investigate' | undefined
  /** high: priority 4–5; medium: 2–3; low: below 2. */
  priority?: 'high' | 'medium' | 'low' | undefined
}

const band = (p: number) => (p >= 4 ? 'high' : p >= 2 ? 'medium' : 'low')

const sum = (values: Iterable<number | null | undefined>) => {
  let total = 0
  for (const v of values) if (typeof v === 'number') total += v
  return total
}

/** Read models of the Recommendations tab: queries only, computed values derived (FR-006). */
export const makeRecommendationQueries = (deps: SynthesisDeps) => {
  const cardOf = (r: Recommendation, insights: ReadonlyMap<string, InsightLine>) => {
    const k = kindShown(r, insights)
    // Counted links only: a suggested insight counts once a person accepts it (FR-005).
    const states = r.links
      .filter((l) => l.state === 'counted')
      .map((l) => linkStateOf(l, insights.get(l.insightId)))
    return {
      id: r.id,
      version: r.version,
      action: r.action,
      kind: r.kind,
      kindShown: k.kind,
      downgraded: k.downgraded,
      impact: r.impact,
      effort: r.effort,
      priority: priority(r.impact, r.effort),
      owner: r.owner,
      status: r.status,
      origin: r.origin,
      translation: r.translation,
      insights: states.filter((s) => s === 'validated' || s === 'changed').length,
      insightsToValidate: states.filter((s) => s === 'to-decide').length,
      insightsChanged: insightsChanged(r.links, insights),
      suggested: r.links.filter((l) => l.state === 'suggested').length,
    }
  }

  const runView = async (run: RecommendationRun | null) => {
    if (!run) return null
    const names = await deps.store.accountNames([run.startedBy])
    const live = isRunLive(run, deps.clock.now())
    return {
      id: run.id,
      calls: run.calls,
      callsDone: run.callsDone,
      leftOut: run.leftOut,
      failure: run.failure ?? (run.finishedAt === null && !live ? ('INTERRUPTED' as const) : null),
      stopping: run.stopRequested && live,
      startedBy: { id: run.startedBy, name: names.get(run.startedBy) ?? null },
      finished: run.finishedAt !== null || !live,
    }
  }

  /** FR-001: the recommendations in creation order, the run, the costs and the takeaways. */
  const overview = async (accountId: string, projectId: string, filters: Filters = {}) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    // The runs first: a run seen finished has saved its recommendations.
    const runs = await deps.store.recommendationRunsOf(projectId)
    const recommendations = await deps.store.recommendationsOf(projectId)
    // Each read once per request (it is polled while a run or a draft is live).
    const rawInsights = await deps.store.insightsOf(projectId)
    const insights = await insightsNow(deps, project.value, projectId, rawInsights)
    const cards = recommendations.map((r) => cardOf(r, insights))
    const refs = [
      ...runs.flatMap((r) =>
        Array.from({ length: r.calls }, (_, n) => recommendationsRef(r.id, n + 1)),
      ),
      takeawaysRef(projectId),
      takeawaysTranslationRef(projectId),
      recommendationTranslationRef(projectId),
    ]
    const costs = await deps.ai.costs(refs)
    const last = runs[0]
    const takeaways = (await deps.store.getTakeaways(projectId)) ?? blankTakeaways(projectId)
    const who = takeaways.savedBy ? await deps.store.accountNames([takeaways.savedBy]) : new Map()
    const provider = await deps.ai.providerOf(accountId)
    const all = [...insights.values()]
    return ok({
      recommendations: cards.filter(
        (c) =>
          (!filters.status ||
            c.status === filters.status ||
            (filters.status === 'validated' && c.status === 'edited')) &&
          (!filters.kind || c.kindShown === filters.kind) &&
          (!filters.priority || band(c.priority) === filters.priority),
      ),
      counts: {
        proposed: cards.filter((c) => c.status === 'proposed').length,
        validated: cards.filter((c) => c.status === 'validated' || c.status === 'edited').length,
        rejected: cards.filter((c) => c.status === 'rejected').length,
      },
      insights: all.filter((i) => i.status === 'validated' || i.status === 'edited').length,
      insightsToDecide: all.filter((i) => i.status === 'proposed').length,
      run: await runView(runs[0] ?? null),
      lastRunCost: last
        ? sum(
            Array.from({ length: last.calls }, (_, n) =>
              costs.get(recommendationsRef(last.id, n + 1)),
            ),
          )
        : null,
      cost: sum(refs.map((r) => costs.get(r))),
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, projectId, provider))
        : true,
      takeaways: {
        text: takeaways.text,
        translation: takeaways.translation,
        version: takeaways.version,
        savedBy: takeaways.savedBy
          ? { id: takeaways.savedBy, name: who.get(takeaways.savedBy) ?? null }
          : null,
        savedAt: takeaways.savedAt?.toISOString() ?? null,
        outOfDate: outOfDate(
          takeaways.savedOver,
          basisOf(rawInsights, insights, recommendations, takeaways.withProposed),
        ),
        withProposed: takeaways.withProposed,
        // What the saved text rests on that is still to decide now.
        toValidate: toValidate(takeaways.savedOver, [...rawInsights, ...recommendations]),
        // FR-012: what the drafts cost, shown in their own block.
        cost: costs.get(takeawaysRef(projectId)) ?? null,
        draft: {
          text: takeaways.draft.text,
          state: takeaways.draft.state,
          withProposed: takeaways.draft.withProposed,
        },
      },
    })
  }

  /** FR-014: a recommendation with its insights as they are now. */
  const detail = async (accountId: string, projectId: string, id: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const r = await deps.store.getRecommendation(id)
    if (!r || r.projectId !== projectId) return err('RECOMMENDATION_NOT_FOUND' as const)
    const insights = await insightsNow(deps, project.value, projectId)
    const card = cardOf(r, insights)
    return ok({
      id: r.id,
      version: r.version,
      action: r.action,
      rationale: r.rationale,
      successMeasure: r.successMeasure,
      kind: r.kind,
      kindShown: card.kindShown,
      downgraded: card.downgraded,
      impact: r.impact,
      effort: r.effort,
      priority: card.priority,
      owner: r.owner,
      status: r.status,
      origin: r.origin,
      translation: r.translation,
      links: r.links.map((l) => {
        const i = insights.get(l.insightId)
        return {
          insightId: l.insightId,
          state: l.state,
          origin: l.origin,
          insight: linkStateOf(l, i),
          statement: i?.statement ?? null,
          theme: i ? { key: i.themeKey, title: i.themeTitle } : null,
          level: i?.level ?? null,
          polarity: i?.polarity ?? null,
          version: i?.version ?? null,
        }
      }),
    })
  }

  /** FR-014: the insights to link: not rejected, searched, by theme and confidence, "not used". */
  const insightsToLink = async (
    accountId: string,
    projectId: string,
    query: {
      q?: string | undefined
      theme?: string | undefined
      level?: string | undefined
      unused: boolean
    },
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const insights = [...(await insightsNow(deps, project.value, projectId)).values()].filter(
      (i) => i.status !== 'rejected',
    )
    const used = new Map<string, number>()
    for (const r of await deps.store.recommendationsOf(projectId))
      if (r.status !== 'rejected')
        for (const l of r.links)
          if (l.state !== 'unlinked') used.set(l.insightId, (used.get(l.insightId) ?? 0) + 1)
    const language = await deps.sources.language(accountId)
    const q = query.q ? fold(query.q) : null
    return ok(
      insights
        .filter(
          (i) =>
            (!q || fold(i.statement[language] || i.statement.en).includes(q)) &&
            (!query.theme || i.themeKey === query.theme) &&
            (!query.level || i.level === query.level) &&
            (!query.unused || !used.has(i.id)),
        )
        .map((i) => ({
          id: i.id,
          statement: i.statement,
          theme: { key: i.themeKey, title: i.themeTitle },
          level: i.level,
          polarity: i.polarity,
          status: i.status,
          version: i.version,
          recommendations: used.get(i.id) ?? 0,
        })),
    )
  }

  return { overview, detail, insightsToLink }
}
