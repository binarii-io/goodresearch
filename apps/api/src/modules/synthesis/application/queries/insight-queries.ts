import { anyCostUnknown, err, fold, ok, sumKnownCosts } from '@goodresearch/shared'
import { confidence, panelOf, polarity, supportFacts } from '../../domain/confidence.ts'
import { themeOf } from '../../domain/fact-lines.ts'
import {
  type InsightRun,
  insightRunRefs,
  insightTranslationRef,
  isRunLive,
} from '../../domain/insight-run.ts'
import type { FactNow, Insight } from '../../domain/insights.ts'
import { evidenceChanged, linkState } from '../../domain/links.ts'
import type { SourceFact, SynthesisDeps } from '../ports.ts'
import { projectOf, projectThemes, readerMask } from '../project.ts'

export const FACTS_PAGE = 25

type Filters = {
  theme?: string | undefined
  status?: 'proposed' | 'validated' | 'edited' | 'rejected' | undefined
  confidence?: 'high' | 'medium' | 'low' | undefined
  polarity?: 'positive' | 'negative' | 'neutral' | 'mixed' | undefined
}

/** Read models of the Insights tab: queries only, computed values derived, never written. */
export const makeInsightQueries = (deps: SynthesisDeps) => {
  /** The project's facts now: those of its studies, then the linked ones that left or changed. */
  const factsNow = async (
    studyIds: ReadonlySet<string>,
    insights: readonly Insight[],
    /** The studies' facts when the caller already read them. */
    loaded?: readonly SourceFact[],
  ) => {
    const own = loaded ?? (await deps.sources.facts([...studyIds]))
    const known = new Set(own.map((f) => f.id))
    const missing = [
      ...new Set(
        insights.flatMap((i) => i.links.map((l) => l.factId)).filter((id) => !known.has(id)),
      ),
    ]
    const others = missing.length > 0 ? await deps.sources.factsByIds(missing) : []
    return { own, byId: new Map<string, SourceFact>([...own, ...others].map((f) => [f.id, f])) }
  }

  const cardOf = (
    i: Insight,
    facts: ReadonlyMap<string, FactNow>,
    studyIds: ReadonlySet<string>,
    panel: number,
    panelIfAccepted: number,
  ) => ({
    id: i.id,
    version: i.version,
    theme: i.theme,
    statement: i.statement,
    status: i.status,
    origin: i.origin,
    translation: i.translation,
    confidence: confidence(i.links, facts, studyIds, panel, panelIfAccepted),
    polarity: polarity(i.links, facts, studyIds),
    polarityIfAccepted: polarity(i.links, facts, studyIds, true),
    supportFacts: supportFacts(i.links, facts, studyIds),
    supportFactsIfAccepted: supportFacts(i.links, facts, studyIds, true),
    evidenceChanged: evidenceChanged(i.links, facts, studyIds),
    suggested: i.links.filter((l) => l.state === 'suggested').length,
    // Linked facts still to decide in their study: counted once accepted.
    toValidate: i.links.filter(
      (l) => l.state !== 'unlinked' && linkState(l, facts.get(l.factId), studyIds) === 'to-decide',
    ).length,
  })

  const costsOf = async (projectId: string, runs: readonly InsightRun[]) => {
    const refs = [...runs.flatMap(insightRunRefs), insightTranslationRef(projectId)]
    const costs = await deps.ai.costs(refs)
    const last = runs[0]
    return {
      cost: sumKnownCosts(refs.map((r) => costs.get(r))),
      costIncomplete: anyCostUnknown(refs.map((r) => costs.get(r))),
      lastRunCost: last ? sumKnownCosts(insightRunRefs(last).map((r) => costs.get(r))) : null,
    }
  }

  /**
   * The project's insights with their computed values, as recommendations read them (spec 014
   * research R1): status, statement, theme, confidence level, polarity, participants.
   */
  const now = async (
    studyIds: ReadonlySet<string>,
    insights: readonly Insight[],
    loaded?: readonly SourceFact[],
  ) => {
    const { own, byId } = await factsNow(studyIds, insights, loaded)
    const panel = panelOf(own, studyIds)
    const panelIfAccepted = panelOf(own, studyIds, true)
    return insights.map((i) => cardOf(i, byId, studyIds, panel, panelIfAccepted))
  }

  /** FR-001: the insights grouped by theme, with their computed values, the run and the costs. */
  const overview = async (accountId: string, projectId: string, filters: Filters = {}) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const { studyIds, studies } = project.value
    // The runs first: a run seen finished has saved its insights, so the tab stops refreshing
    // only once they are all shown.
    const runs = await deps.store.runsOf(projectId)
    const insights = await deps.store.insightsOf(projectId)
    const { own, byId } = await factsNow(studyIds, insights)
    const panel = panelOf(own, studyIds)
    const panelIfAccepted = panelOf(own, studyIds, true)
    const themes = await projectThemes(deps, accountId, studies, own)
    for (const i of insights)
      if (!themes.some((t) => t.key === i.theme.key)) themes.splice(themes.length - 1, 0, i.theme)
    const mask = await readerMask(deps, accountId, project.value)
    const cards = insights.map((i) => ({
      ...cardOf(i, byId, studyIds, panel, panelIfAccepted),
      statement: mask(i.statement),
    }))
    const order = new Map(themes.map((t, n) => [t.key, n]))
    const shown = cards
      .filter(
        (c) =>
          (!filters.theme || c.theme.key === filters.theme) &&
          (!filters.status ||
            c.status === filters.status ||
            (filters.status === 'validated' && c.status === 'edited')) &&
          (!filters.confidence || c.confidence.level === filters.confidence) &&
          (!filters.polarity || c.polarity === filters.polarity),
      )
      // By theme, then in creation order: a decision or a link never moves an insight.
      .sort((a, b) => (order.get(a.theme.key) ?? 0) - (order.get(b.theme.key) ?? 0))
    const run = runs[0] ?? null
    const names = run ? await deps.store.accountNames([run.startedBy]) : new Map()
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      themes,
      insights: shown,
      counts: {
        proposed: cards.filter((c) => c.status === 'proposed').length,
        validated: cards.filter((c) => c.status === 'validated' || c.status === 'edited').length,
        rejected: cards.filter((c) => c.status === 'rejected').length,
      },
      facts: own.filter((f) => f.status !== 'proposed').length,
      factsToDecide: own.filter((f) => f.status === 'proposed').length,
      panel,
      run: run
        ? {
            id: run.id,
            calls: run.calls,
            callsDone: run.callsDone,
            leftOut: run.leftOut,
            failure:
              run.failure ??
              (run.finishedAt === null && !isRunLive(run, deps.clock.now()) ? 'INTERRUPTED' : null),
            stopping: run.stopRequested && isRunLive(run, deps.clock.now()),
            // Spec 026: who ran it stays with the team.
            startedBy: {
              id: run.startedBy,
              name: project.value.canChange ? (names.get(run.startedBy) ?? null) : null,
            },
            // A run whose worker stopped beating is over, as the next start will record it.
            finished: run.finishedAt !== null || !isRunLive(run, deps.clock.now()),
          }
        : null,
      ...(await costsOf(projectId, runs)),
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, projectId, provider))
        : true,
    })
  }

  /** FR-014: an insight with its facts, each with its state now and its participant. */
  const detail = async (accountId: string, projectId: string, insightId: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const insight = await deps.store.getInsight(insightId)
    if (!insight || insight.projectId !== projectId) return err('INSIGHT_NOT_FOUND' as const)
    const { studyIds, studies } = project.value
    const { own, byId } = await factsNow(studyIds, [insight])
    const open = new Set(studies.filter((s) => s.access).map((s) => s.id))
    const reader = project.value.canChange === false
    const names =
      insight.decidedBy && !reader ? await deps.store.accountNames([insight.decidedBy]) : new Map()
    const mask = await readerMask(deps, accountId, project.value)
    return ok({
      id: insight.id,
      version: insight.version,
      theme: insight.theme,
      statement: mask(insight.statement),
      description: mask(insight.description),
      counterEvidence: mask(insight.counterEvidence),
      minorityView: mask(insight.minorityView),
      status: insight.status,
      origin: insight.origin,
      translation: insight.translation,
      confidence: confidence(
        insight.links,
        byId,
        studyIds,
        panelOf(own, studyIds),
        panelOf(own, studyIds, true),
      ),
      polarity: polarity(insight.links, byId, studyIds),
      links: insight.links.map((l) => {
        const fact = byId.get(l.factId)
        const visible = fact && open.has(fact.studyId)
        return {
          factId: l.factId,
          role: l.role,
          state: l.state,
          origin: l.origin,
          fact: linkState(l, fact, studyIds),
          // FR-018: a study the viewer cannot open shows its facts as counts only.
          studyId: visible ? fact.studyId : null,
          sessionId: visible ? fact.sessionId : null,
          participant: visible ? (fact.participants[0] ?? null) : null,
          version: visible ? fact.version : null,
          statement: visible ? mask(fact.statement) : null,
          polarity: visible ? fact.polarity : null,
        }
      }),
      decidedBy: insight.decidedBy
        ? { id: insight.decidedBy, name: names.get(insight.decidedBy) ?? null }
        : null,
    })
  }

  /** FR-013: the project's facts not rejected the person can open, paged, searched and filtered. */
  const facts = async (
    accountId: string,
    projectId: string,
    query: {
      page: number
      q?: string | undefined
      polarity?: 'positive' | 'negative' | 'neutral' | undefined
      theme?: string | undefined
      study?: string | undefined
      unlinked: boolean
      status?: 'accepted' | 'to-decide' | undefined
    },
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const open = project.value.studies.filter((s) => s.access)
    const names = new Map(open.map((s) => [s.id, s.name]))
    const mask = await readerMask(deps, accountId, project.value)
    const all = await deps.sources.facts(open.map((s) => s.id))
    const insights = (await deps.store.insightsOf(projectId)).filter((i) => i.status !== 'rejected')
    const cited = new Map<string, number>()
    for (const i of insights)
      for (const l of i.links)
        if (l.state !== 'unlinked') cited.set(l.factId, (cited.get(l.factId) ?? 0) + 1)
    const language = await deps.sources.language(accountId)
    const q = query.q ? fold(query.q) : null
    const matching = all.filter(
      (f) =>
        // Spec 026: a reader searches what they see, or a search would reveal a masked name.
        (!q || fold(mask(f.statement)[language]).includes(q)) &&
        (!query.polarity || f.polarity === query.polarity) &&
        (!query.theme || themeOf(f.theme).key === query.theme) &&
        (!query.study || f.studyId === query.study) &&
        (!query.unlinked || !cited.has(f.id)) &&
        (!query.status ||
          (query.status === 'to-decide' ? f.status === 'proposed' : f.status !== 'proposed')),
    )
    const page = Math.max(1, query.page)
    return ok({
      items: matching.slice((page - 1) * FACTS_PAGE, page * FACTS_PAGE).map((f) => ({
        id: f.id,
        version: f.version,
        studyId: f.studyId,
        studyName: names.get(f.studyId) ?? '',
        sessionId: f.sessionId,
        participant: f.participants[0] ?? null,
        statement: mask(f.statement),
        status: f.status === 'proposed' ? ('to-decide' as const) : ('accepted' as const),
        polarity: f.polarity,
        theme: themeOf(f.theme),
        insights: cited.get(f.id) ?? 0,
      })),
      total: matching.length,
      page,
      pageSize: FACTS_PAGE,
      studies: open.map((s) => ({ id: s.id, name: s.name })),
    })
  }

  return { overview, detail, facts, now }
}
