import type { Insight } from '../domain/insights.ts'
import type { Recommendation } from '../domain/recommendations.ts'
import { savedOverOf, type Takeaways } from '../domain/takeaways.ts'
import { type InsightLine, insightsNow } from './insights-now.ts'
import type { SynthesisDeps } from './ports.ts'
import type { ProjectView } from './project.ts'

export const blankTakeaways = (projectId: string): Takeaways => ({
  projectId,
  text: { en: '', fr: '' },
  translation: 'done',
  pendingTranslation: null,
  savedBy: null,
  savedAt: null,
  version: 0,
  savedOver: null,
  withProposed: false,
  draft: { text: null, state: 'none', by: null, at: null, withProposed: false },
})

/**
 * What the takeaways rest on now (FR-010): the validated insights, with their confidence, and
 * recommendations; also those still to decide when `withProposed`.
 */
export const basisOf = (
  insights: readonly Insight[],
  lines: ReadonlyMap<string, InsightLine>,
  recommendations: readonly Recommendation[],
  withProposed: boolean,
) =>
  savedOverOf(
    insights.map((i) => ({ ...i, level: lines.get(i.id)?.level })),
    recommendations,
    withProposed,
  )

export const takeawaysBasis = async (
  deps: SynthesisDeps,
  project: ProjectView,
  projectId: string,
  withProposed: boolean,
) => {
  const [insights, recommendations] = await Promise.all([
    deps.store.insightsOf(projectId),
    deps.store.recommendationsOf(projectId),
  ])
  const lines = await insightsNow(deps, project, projectId, insights)
  return basisOf(insights, lines, recommendations, withProposed)
}
