import type { Result } from '@goodresearch/shared'
import type {
  Accepted,
  ItemMap,
  RawResponse,
  StoredResponse,
  SurveySection,
} from '../domain/responses.ts'

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type ReadingRow = {
  readonly studyId: string
  readonly status: 'done' | 'failed' | 'stopped'
  readonly readAt: Date
  readonly readBy: string | null
  readonly unknownQuestions: number
  readonly unknownValues: number
}

export type RuleRow = {
  readonly studyId: string
  readonly accepted: Accepted
  readonly version: number
  readonly origin: 'person' | 'assistant'
  readonly updatedBy: string | null
  readonly updatedAt: Date
}

export interface SurveysStore {
  reading(studyId: string): Promise<ReadingRow | null>
  /** A failure changes only the status: what was read, and when, stays true (FR-007). */
  markFailed(studyId: string, at: Date, by: string): Promise<void>
  /**
   * Upserts what was read and, when `complete`, removes the form's responses no longer at the
   * source, with the reading, in one transaction.
   */
  replaceResponses(c: {
    studyId: string
    formFileId: string
    responses: readonly StoredResponse[]
    complete: boolean
    readAt: Date
    reading: ReadingRow
  }): Promise<void>
  rule(studyId: string): Promise<RuleRow | null>
  /** Against the version seen; false when it moved. */
  saveRule(row: RuleRow, expected: number | null): Promise<boolean>
  count(studyId: string, formFileId: string): Promise<number>
  recordWordings(
    studyId: string,
    wordings: readonly { itemId: string; text: string }[],
    until: Date,
  ): Promise<void>
}

export type FormFiles = {
  metadata(
    fileId: string,
  ): Promise<
    Result<{ canEdit: boolean; trashed: boolean; parents: readonly string[] } | null, string>
  >
  readForm(fileId: string): Promise<
    Result<
      {
        blocks: readonly {
          formItemId: string
          kind: string
          options?: readonly { value: string; exit: boolean }[]
        }[]
      },
      string
    >
  >
  listResponses(
    fileId: string,
    max: number,
  ): Promise<Result<{ responses: readonly RawResponse[]; complete: boolean }, string>>
  readonly folderId: string
}

export type SurveysDeps = {
  readonly store: SurveysStore
  readonly clock: { now(): Date }
  /** With the person's own access to the study's folder. */
  readonly files: (accountId: string, studyId: string) => Promise<Result<FormFiles, string>>
  readonly questionnaire: (
    accountId: string,
    studyId: string,
  ) => Promise<
    Result<
      {
        content: { framing: { targetResponses: number | null }; sections: readonly SurveySection[] }
        version: number
      } | null,
      string
    >
  >
  /** The study's published form; null when there is none. */
  readonly form: (studyId: string) => Promise<{ fileId: string; itemMap: ItemMap | null } | null>
}
