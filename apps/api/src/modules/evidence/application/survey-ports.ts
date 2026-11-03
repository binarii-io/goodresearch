import type { Clock, Result } from '@goodresearch/shared'
import type { FactStatus, Statement } from '../domain/facts.ts'
import type { FigureContext, FigureSnapshot, SurveyFact } from '../domain/survey-facts.ts'
import type { FactsAi, StudyAccess, SurveyFactRequest, TranslateJob } from './ports.ts'

/** A figure as a person points at it in the Analysis tab (spec 029). */
export type FigureRef = Omit<FigureSnapshot, 'value' | 'base' | 'smallBase' | 'ruleVersion'>

/** Today's figure, computed by Surveys, with what a statement names. */
export type FigureToday = {
  readonly snapshot: FigureSnapshot
  readonly context: FigureContext
  readonly section: { readonly id: string; readonly title: string }
}

export type ThemeNow = {
  readonly itemId: string
  readonly itemText: string
  readonly status: 'proposed' | 'accepted' | 'rejected'
  readonly label: Statement
  readonly description: Statement
  readonly share: { readonly answers: number; readonly base: number }
  readonly quotes: readonly string[]
  readonly section: { readonly id: string; readonly title: string }
}

/** Why Surveys could not read a study's figures. */
export type SurveyReadError =
  | 'STUDY_NOT_FOUND'
  | 'NOT_A_SURVEY_STUDY'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VALIDATION'

/** What survey facts read from Surveys, with the person's own access (compose.ts). */
export type SurveySources = {
  figures(
    accountId: string,
    studyId: string,
    refs: readonly FigureRef[],
  ): Promise<Result<readonly (FigureToday | null)[], SurveyReadError>>
  theme(accountId: string, studyId: string, themeId: string): Promise<ThemeNow | null>
  /** FR-010a: the flat sort as text and the accepted themes, what "Find facts" sends. */
  findingInput(
    accountId: string,
    studyId: string,
  ): Promise<
    Result<
      {
        readonly counted: number
        readonly figureCount: number
        readonly figures: string
        readonly themes: SurveyFactRequest['themes']
      },
      SurveyReadError
    >
  >
}

export type SurveyFactStore = {
  insert(fact: SurveyFact, at: Date): Promise<void>
  get(id: string): Promise<SurveyFact | null>
  /** Saved if still at version `expected`. */
  save(fact: SurveyFact, expected: number): Promise<'ok' | 'conflict'>
  page(
    studyId: string,
    status: 'to-decide' | 'accepted' | 'rejected' | 'all',
    page: number,
    size: number,
  ): Promise<{ facts: SurveyFact[]; total: number }>
  counts(studyId: string): Promise<{ status: FactStatus; count: number }[]>
  /** Every fact of a study, rejected ones too. */
  allOf(studyId: string): Promise<SurveyFact[]>
  /** Not rejected, for the project's insights. */
  ofStudies(studyIds: readonly string[]): Promise<SurveyFact[]>
  byIds(ids: readonly string[]): Promise<SurveyFact[]>
}

export type SurveyFactDeps = {
  readonly store: SurveyFactStore
  readonly surveys: SurveySources
  readonly studyAccess: (accountId: string, studyId: string) => Promise<StudyAccess | null>
  readonly knownNames: (accountId: string, studyId: string) => Promise<readonly string[]>
  readonly ai: Pick<FactsAi, 'surveyFacts' | 'surveyEstimate' | 'providerOf'>
  readonly translate: (
    accountId: string,
    ref: string,
    request: { text: string; from: 'en' | 'fr'; to: 'en' | 'fr' },
  ) => Promise<string>
  readonly accountNames: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>
  readonly enqueueTranslation: (job: TranslateJob & { readonly survey: true }) => Promise<boolean>
  readonly clock: Clock
  readonly log: { warn(object: object, message: string): void }
}
