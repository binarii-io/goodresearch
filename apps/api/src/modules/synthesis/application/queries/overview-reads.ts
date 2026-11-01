import type { Clock } from '@goodresearch/shared'
import {
  insightRunRefs,
  insightTranslationRef,
  isRunLive,
  recommendationRunRefs,
  recommendationTranslationRef,
  takeawaysRef,
  takeawaysTranslationRef,
} from '../../domain/insight-run.ts'
import type { SynthesisStore } from '../ports.ts'

/** Spec 017: what the project's Overview reads of Synthesis; no access check, Reporting holds it. */
export const makeOverviewReads = (store: SynthesisStore, clock: Clock) => ({
  /** Spec 019: a study cannot leave the project while a run reads it. */
  isRunning: async (projectId: string) => {
    const now = clock.now()
    const [insights, recommendations] = await Promise.all([
      store.openRun(projectId),
      store.openRecommendationRun(projectId),
    ])
    return isRunLive(insights, now) || isRunLive(recommendations, now)
  },
  insightCounts: store.insightCounts,
  recommendationCounts: store.recommendationCounts,
  /** Null until written in one language. */
  takeaways: async (projectId: string) => {
    const takeaways = await store.takeawaysText(projectId)
    return takeaways && (takeaways.text.en || takeaways.text.fr) ? takeaways : null
  },
  costRefs: async (projectId: string) => {
    const [insightRuns, recommendationRuns] = await Promise.all([
      store.runsOf(projectId),
      store.recommendationRunsOf(projectId),
    ])
    return {
      insights: [...insightRuns.flatMap(insightRunRefs), insightTranslationRef(projectId)],
      recommendations: [
        ...recommendationRuns.flatMap(recommendationRunRefs),
        recommendationTranslationRef(projectId),
      ],
      takeaways: [takeawaysRef(projectId), takeawaysTranslationRef(projectId)],
    }
  },
})
