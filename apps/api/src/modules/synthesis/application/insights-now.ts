import type { Insight } from '../domain/insights.ts'
import type { InsightNow } from '../domain/recommendations.ts'
import type { SourceFact, SynthesisDeps } from './ports.ts'
import type { ProjectView } from './project.ts'
import { makeInsightQueries } from './queries/insight-queries.ts'

export type InsightLine = InsightNow & {
  readonly statement: { readonly en: string; readonly fr: string }
  readonly themeTitle: string | null
  readonly polarity: 'positive' | 'negative' | 'neutral' | 'mixed'
  readonly support: number
  readonly counter: number
  /** Participants with accepted facts in the project. */
  readonly panel: number
  /** Supporting facts linked and counted. */
  readonly facts: number
}

/**
 * Spec 014 research R1: the project's insights with their computed confidence and polarity, as
 * recommendations and the key takeaways read them.
 */
export const insightsNow = async (
  deps: SynthesisDeps,
  project: ProjectView,
  projectId: string,
  /** The project's insights when the caller already read them. */
  loaded?: readonly Insight[],
  /**
   * Spec 015: the values once the linked facts still to decide are accepted (participants for
   * and against, panel, confidence, polarity), as the debrief shows them with what is to decide.
   */
  options: { withToDecide?: boolean; facts?: readonly SourceFact[] } = {},
): Promise<ReadonlyMap<string, InsightLine>> => {
  const all = options.withToDecide === true
  const insights = loaded ?? (await deps.store.insightsOf(projectId))
  const cards = await makeInsightQueries(deps).now(project.studyIds, insights, options.facts)
  return new Map(
    cards.map((c) => [
      c.id,
      {
        id: c.id,
        status: c.status,
        statementEn: c.statement.en,
        statement: c.statement,
        themeKey: c.theme.key,
        themeTitle: c.theme.title,
        level: all ? c.confidence.levelIfAccepted : c.confidence.level,
        polarity: all ? c.polarityIfAccepted : c.polarity,
        support: c.confidence.support + (all ? c.confidence.pendingSupport : 0),
        counter: c.confidence.counter + (all ? c.confidence.pendingCounter : 0),
        panel: all ? c.confidence.panelIfAccepted : c.confidence.panel,
        facts: all ? c.supportFactsIfAccepted : c.supportFacts,
        version: c.version,
      },
    ]),
  )
}

/** What a run or a draft reads: validated, and still to decide when asked (spec 014). */
export const readable = (status: string, withProposed: boolean) =>
  status === 'validated' || status === 'edited' || (withProposed && status === 'proposed')

/**
 * One insight as the AI reads it (spec 014 research R2): its weight and its words, never a fact,
 * a name or a study.
 */
export const insightLine = (i: InsightLine, language: 'en' | 'fr') =>
  `${i.themeTitle ?? 'Other'} | ${i.level} | ${i.polarity} | for ${i.support} against ${i.counter} of ${i.panel} participants | ${i.facts} facts | ${i.statement[language] || i.statement.en}`
