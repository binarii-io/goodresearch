import type { Clock } from '@goodresearch/shared'
import type { InsightRun } from '../domain/insight-run.ts'
import type { FactNow, Insight, InsightAnswer } from '../domain/insights.ts'

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

export type TranslatedTexts = Partial<
  Record<'statement' | 'description' | 'counterEvidence' | 'minorityView', string>
>

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
  providerOf(accountId: string): Promise<string | null>
  estimate(
    accountId: string,
    inputChars: number,
    outputTokens: number,
    calls: number,
  ): Promise<number | null>
  /** Costs of ledger refs, over every account. */
  costs(refs: readonly string[]): Promise<ReadonlyMap<string, number | null>>
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

  hasConsent(accountId: string, projectId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, projectId: string, provider: string, at: Date): Promise<void>
  accountNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>
}

export type InsightsJob = { readonly runId: string; readonly projectId: string }

export type InsightTranslateJob = {
  readonly insightId: string
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
  readonly log: { warn(object: object, message: string): void }
}
