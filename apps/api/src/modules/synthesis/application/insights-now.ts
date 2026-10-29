import type { Insight } from '../domain/insights.ts'
import type { InsightNow } from '../domain/recommendations.ts'
import type { SynthesisDeps } from './ports.ts'
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
): Promise<ReadonlyMap<string, InsightLine>> => {
  const insights = loaded ?? (await deps.store.insightsOf(projectId))
  const cards = await makeInsightQueries(deps).now(project.studyIds, insights)
  const factsOf = new Map(
    insights.map((i) => [
      i.id,
      i.links.filter((l) => l.role === 'support' && l.state === 'counted').length,
    ]),
  )
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
        level: c.confidence.level,
        polarity: c.polarity,
        support: c.confidence.support,
        counter: c.confidence.counter,
        panel: c.confidence.panel,
        facts: factsOf.get(c.id) ?? 0,
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
