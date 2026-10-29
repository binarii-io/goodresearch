import type { Clock } from '@goodresearch/shared'
import type { InsightRun, RecommendationRun } from '../domain/insight-run.ts'
import type { Bilingual, FactNow, Insight, InsightAnswer } from '../domain/insights.ts'
import type { Recommendation, RecommendationAnswer } from '../domain/recommendations.ts'
import type { Takeaways } from '../domain/takeaways.ts'

/** A fact of the project as Evidence gives it (spec 013 research R1). */
export type SourceFact = FactNow & { readonly sessionId: string }

/** A study of the project, with the person's own access to its folder (spec 002 FR-010a). */
export type ProjectStudy = { readonly id: string; readonly name: string; readonly access: boolean }

/** What Synthesis reads from the other modules, through `compose.ts` (research R1). */
export type SynthesisSources = {
  /** The project's team and research goal; null without access. */
  project(accountId: string, projectId: string): Promise<{ teamId: string; goal: string } | null>
  studies(accountId: string, projectId: string): Promise<readonly ProjectStudy[]>
  /** The theme sections of a study's guide. */
  themes(accountId: string, studyId: string): Promise<readonly { id: string; title: string }[]>
  /** The facts of these studies not rejected: accepted, edited and still to decide. */
  facts(studyIds: readonly string[]): Promise<readonly SourceFact[]>
  /** Facts by id, any status; a deleted one is absent. */
  factsByIds(ids: readonly string[]): Promise<readonly SourceFact[]>
  /** Every name the app knows for the study: never sent to the AI. */
  knownNames(accountId: string, studyId: string): Promise<readonly string[]>
  /** The person's language: the statements sent are in it (spec 013 assumptions). */
  language(accountId: string): Promise<'en' | 'fr'>
}

/** The provider is not connected (anymore). */
export class AiUnavailable extends Error {
  override name = 'AiUnavailable'
}
/** The provider failed, or answered in a shape that does not fit. */
export class AiFailed extends Error {
  override name = 'AiFailed'
  readonly invalid: boolean
  constructor(invalid: boolean) {
    super(invalid ? 'invalid answer' : 'provider failed')
    this.invalid = invalid
  }
}

/** Research R2: refs only (`fN`, `tN`, `iN`); no name, verbatim, interview title or study name. */
export type InsightRequest = {
  readonly goal: string
  readonly themes: readonly { readonly ref: string; readonly title: string }[]
  readonly facts: readonly string[]
  readonly insights: readonly {
    readonly ref: string
    readonly theme: string
    readonly statement: string
    readonly support: readonly string[]
    readonly counter: readonly string[]
  }[]
  readonly avoid: readonly string[]
}

/** The texts to translate, by field (an insight's, a recommendation's, or the takeaways' `text`). */
export type TranslatedTexts = Partial<Record<string, string>>

export type InsightsAi = {
  /** Throws AiUnavailable or AiFailed. */
  insights(
    accountId: string,
    ref: string,
    request: InsightRequest,
  ): Promise<readonly InsightAnswer[]>
  translate(
    accountId: string,
    ref: string,
    request: { texts: TranslatedTexts; from: 'en' | 'fr'; to: 'en' | 'fr' },
  ): Promise<TranslatedTexts>
  /** Spec 014: recommendations from insight lines. */
  recommendations(
    accountId: string,
    ref: string,
    request: RecommendationRequest,
  ): Promise<readonly RecommendationAnswer[]>
  /** Spec 014: a key takeaways draft, sentence by sentence in both languages. */
  takeaways(
    accountId: string,
    ref: string,
    request: TakeawaysRequest,
  ): Promise<readonly Bilingual[]>
  providerOf(accountId: string): Promise<string | null>
  estimate(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    calls: number,
    /** Whose prompt is counted: an insights run by default. */
    task?: 'insights' | 'recommendations' | 'takeaways',
  ): Promise<number | null>
  /** Costs of ledger refs, over every account. */
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
}

/** Research R2 of spec 014: insight lines only; no fact, name, study or owner. */
export type RecommendationRequest = {
  readonly goal: string
  readonly insights: readonly string[]
  readonly recommendations: readonly string[]
  readonly avoid: readonly string[]
}

export type TakeawaysRequest = {
  readonly goal: string
  /** The takeaways saved, to revise rather than write again; empty when none. */
  readonly current: string
  /** The distribution, as counts (no percentage): panel, insights by level, theme, polarity. */
  readonly overview: readonly string[]
  readonly insights: readonly string[]
  readonly recommendations: readonly string[]
}

export type SaveOutcome = 'ok' | 'stale'

export type SynthesisStore = {
  openRun(projectId: string): Promise<InsightRun | null>
  runsOf(projectId: string): Promise<InsightRun[]>
  getRun(id: string): Promise<InsightRun | null>
  /** Starts a run; false when one is open for the project. */
  startRun(run: InsightRun): Promise<boolean>
  /** Saves progress while unfinished (a stop request set meanwhile is kept). */
  saveRun(run: InsightRun): Promise<void>
  requestStop(runId: string): Promise<void>

  insightsOf(projectId: string): Promise<Insight[]>
  getInsight(id: string): Promise<Insight | null>
  /** Saves an insight with its links if its version is still `expected` (null: a new one). */
  saveInsight(insight: Insight, expected: number | null): Promise<SaveOutcome>
  /**
   * What one call of a run found, in one transaction: new insights, and updates of insights still
   * at their `expected` version; an insight a person changed meanwhile is skipped.
   */
  applyRun(input: {
    readonly creates: readonly Insight[]
    readonly updates: readonly { readonly insight: Insight; readonly expected: number }[]
  }): Promise<{ skipped: number }>

  openRecommendationRun(projectId: string): Promise<RecommendationRun | null>
  recommendationRunsOf(projectId: string): Promise<RecommendationRun[]>
  getRecommendationRun(id: string): Promise<RecommendationRun | null>
  startRecommendationRun(run: RecommendationRun): Promise<boolean>
  saveRecommendationRun(run: RecommendationRun): Promise<void>
  requestRecommendationStop(runId: string): Promise<void>
  recommendationsOf(projectId: string): Promise<Recommendation[]>
  getRecommendation(id: string): Promise<Recommendation | null>
  saveRecommendation(r: Recommendation, expected: number | null): Promise<SaveOutcome>
  applyRecommendations(input: {
    readonly creates: readonly Recommendation[]
    readonly updates: readonly {
      readonly recommendation: Recommendation
      readonly expected: number
    }[]
  }): Promise<{ skipped: number }>
  /** Null when never saved nor drafted. */
  getTakeaways(projectId: string): Promise<Takeaways | null>
  /** Saves the text if its version is still `expected` (0: never saved). */
  saveTakeaways(t: Takeaways, expected: number): Promise<SaveOutcome>
  /** The draft alone, whatever the text's version. */
  saveDraft(projectId: string, draft: Takeaways['draft']): Promise<void>

  hasConsent(accountId: string, projectId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, projectId: string, provider: string, at: Date): Promise<void>
  accountNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>
}

export type InsightsJob = { readonly runId: string; readonly projectId: string }
export type TakeawaysJob = {
  readonly projectId: string
  readonly accountId: string
  /** Also what is still to decide (spec 014 FR-010, update). */
  readonly withProposed?: boolean | undefined
}

export type InsightTranslateJob = {
  /** The id of what is translated: an insight, a recommendation, or the project (takeaways). */
  readonly insightId: string
  /** What is translated; jobs queued before spec 014 have none: an insight. */
  readonly target?: 'insight' | 'recommendation' | 'takeaways' | undefined
  readonly accountId: string
  readonly from: 'en' | 'fr'
  /** The words the person wrote: applied while they are still the insight's (spec 012 R9). */
  readonly texts: TranslatedTexts
}

export type SynthesisDeps = {
  readonly store: SynthesisStore
  readonly sources: SynthesisSources
  readonly ai: InsightsAi
  readonly clock: Clock
  readonly enqueueRun: (job: InsightsJob) => Promise<boolean>
  readonly enqueueTranslation: (job: InsightTranslateJob) => Promise<boolean>
  readonly enqueueRecommendations: (job: InsightsJob) => Promise<boolean>
  readonly enqueueTakeaways: (job: TakeawaysJob) => Promise<boolean>
  readonly log: { warn(object: object, message: string): void }
}
