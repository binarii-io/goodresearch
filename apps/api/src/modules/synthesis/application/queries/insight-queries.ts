import { err, fold, ok } from '@goodresearch/shared'
import { confidence, panelOf, polarity } from '../../domain/confidence.ts'
import { themeOf } from '../../domain/fact-lines.ts'
import {
  type InsightRun,
  insightsRef,
  insightTranslationRef,
  isRunLive,
} from '../../domain/insight-run.ts'
import type { FactNow, Insight } from '../../domain/insights.ts'
import { evidenceChanged, linkState } from '../../domain/links.ts'
import type { SourceFact, SynthesisDeps } from '../ports.ts'
import { projectOf, projectThemes } from '../project.ts'

export const FACTS_PAGE = 25

type Filters = {
  theme?: string | undefined
  status?: 'proposed' | 'validated' | 'edited' | 'rejected' | undefined
  confidence?: 'high' | 'medium' | 'low' | undefined
  polarity?: 'positive' | 'negative' | 'neutral' | 'mixed' | undefined
}

const refsOf = (run: InsightRun) =>
  Array.from({ length: run.calls }, (_, n) => insightsRef(run.id, n + 1))

const sum = (values: Iterable<number | null | undefined>) => {
  let total = 0
  let any = false
  for (const v of values)
    if (typeof v === 'number') {
      total += v
      any = true
    }
  return any ? total : 0
}

/** Read models of the Insights tab: queries only, computed values derived, never written. */
export const makeInsightQueries = (deps: SynthesisDeps) => {
  /** The project's facts now: those of its studies, then the linked ones that left or changed. */
  const factsNow = async (studyIds: ReadonlySet<string>, insights: readonly Insight[]) => {
    const own = await deps.sources.facts([...studyIds])
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
    evidenceChanged: evidenceChanged(i.links, facts, studyIds),
    suggested: i.links.filter((l) => l.state === 'suggested').length,
    // Linked facts still to decide in their study: counted once accepted.
    toValidate: i.links.filter(
      (l) => l.state !== 'unlinked' && linkState(l, facts.get(l.factId), studyIds) === 'to-decide',
    ).length,
  })

  const costsOf = async (projectId: string, runs: readonly InsightRun[]) => {
    const refs = [...runs.flatMap(refsOf), insightTranslationRef(projectId)]
    const costs = await deps.ai.costs(refs)
    const last = runs[0]
    return {
      cost: sum(refs.map((r) => costs.get(r))),
      lastRunCost: last ? sum(refsOf(last).map((r) => costs.get(r))) : null,
    }
  }

  /**
   * The project's insights with their computed values, as recommendations read them (spec 014
   * research R1): status, statement, theme, confidence level, polarity, participants.
   */
  const now = async (studyIds: ReadonlySet<string>, insights: readonly Insight[]) => {
    const { own, byId } = await factsNow(studyIds, insights)
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
    const cards = insights.map((i) => cardOf(i, byId, studyIds, panel, panelIfAccepted))
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
            startedBy: { id: run.startedBy, name: names.get(run.startedBy) ?? null },
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
    const names = insight.decidedBy ? await deps.store.accountNames([insight.decidedBy]) : new Map()
    return ok({
      id: insight.id,
      version: insight.version,
      theme: insight.theme,
      statement: insight.statement,
      description: insight.description,
      counterEvidence: insight.counterEvidence,
      minorityView: insight.minorityView,
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
          statement: visible ? fact.statement : null,
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
        (!q || fold(f.statement[language]).includes(q)) &&
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
        statement: f.statement,
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
