import type { FactStatus, Polarity, Statement, Translation } from '../domain/facts.ts'
import type { TaskOutcomes } from '../domain/usability-facts.ts'

/** Spec 039: the filters of a study's Facts list, the same for every source. */
export type FactBoardStatus = 'to-decide' | 'accepted' | 'rejected' | 'all'

/** What a fact rests on, by source. */
export type FactEvidence =
  | { readonly kind: 'verbatims'; readonly count: number }
  | { readonly kind: 'figure'; readonly base: number }
  | {
      readonly kind: 'observation'
      readonly observationId: string
      readonly sessionId: string
      readonly momentMs: number
      readonly quote: string | null
      readonly participant: string | null
      readonly screenshot: boolean
    }
  | {
      readonly kind: 'task'
      readonly taskId: string
      readonly outcomes: TaskOutcomes
      readonly sessions: number
      readonly figuresChanged: boolean
    }

export type StoredFactRow = {
  readonly id: string
  readonly version: number
  readonly studyId: string
  readonly source: 'interview' | 'survey' | 'usability'
  readonly sessionId: string | null
  readonly status: FactStatus
  readonly statement: Statement
  readonly translation: Translation
  readonly polarity: Polarity
  readonly theme: { readonly id: string; readonly title: string } | null
  readonly origin: 'ai' | 'person'
  readonly evidence: FactEvidence
}

export type FactHead = {
  readonly id: string
  readonly source: StoredFactRow['source']
  readonly studyId: string
  readonly version: number
}

export type FactCounts = { toDecide: number; accepted: number; edited: number; rejected: number }

export type FactBoardStore = {
  head(factId: string): Promise<FactHead | null>
  heads(factIds: readonly string[]): Promise<FactHead[]>
  /** Its facts per status, in one SQL count (the tiles and tab of an Analysis tab). */
  counts(studyId: string): Promise<FactCounts>
  page(
    studyId: string,
    query: { status: FactBoardStatus; q?: string | undefined; page: number },
    size: number,
  ): Promise<{
    total: number
    counts: FactCounts
    rows: StoredFactRow[]
  }>
}

/**
 * Spec 039: the Usability analysis module decides an observation and its fact together (wired in
 * compose.ts; Evidence never imports that module).
 */
export type UsabilityDecisions = {
  decideObservation(
    actor: { id: string; role: 'admin' | 'member' },
    observationId: string,
    decision: 'accept' | 'reject' | 'reopen' | 'edit',
    /** An edit's statement, in the language it was written in. */
    edit: { text: string; language: 'en' | 'fr' } | null,
  ): Promise<
    | { ok: true }
    | {
        ok: false
        error:
          | 'OBSERVATION_NOT_FOUND'
          | 'SESSION_NOT_FOUND'
          | 'FOLDER_ACCESS_REQUIRED'
          | 'VERSION_CONFLICT'
          | 'VALIDATION'
          | 'INVALID_TRANSITION'
          | 'NAME_IN_STATEMENT'
      }
  >
}
