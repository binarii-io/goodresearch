import type { Questionnaire } from './questionnaire.ts'

export type ReadinessKind = 'review' | 'pre-test'

export type ReadinessMarkRow = {
  readonly studyId: string
  readonly kind: ReadinessKind
  readonly people: number | null
  readonly questionnaireVersion: number
  readonly markedBy: string
  readonly markedAt: Date
}

export interface QuestionnaireRepository {
  findByStudy(studyId: string): Promise<Questionnaire | null>
  /** Throws `ConcurrencyError` when the study already has one (two first saves racing). */
  insert(questionnaire: Questionnaire): Promise<void>
  /** Optimistic locking; throws `ConcurrencyError` on a stale version. */
  update(questionnaire: Questionnaire): Promise<void>
  /** A mark does not raise the questionnaire's version. */
  mark(row: ReadinessMarkRow): Promise<void>
  unmark(studyId: string, kind: ReadinessKind): Promise<void>
}
