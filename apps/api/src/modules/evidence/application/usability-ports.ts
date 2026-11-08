import type { UsabilityFact } from '../domain/usability-facts.ts'
import type { TranslateJob } from './ports.ts'

/** Spec 038: usability facts, in the facts table with source `usability` and their support. */
export type UsabilityFactStore = {
  byObservation(observationId: string): Promise<UsabilityFact | null>
  get(id: string): Promise<UsabilityFact | null>
  /** Inserts or replaces the fact of its observation, with its support. */
  put(fact: UsabilityFact, at: Date): Promise<void>
  /** Writes the fact if its version is still `expected`. */
  save(fact: UsabilityFact, expected: number): Promise<'ok' | 'conflict'>
  deleteIds(ids: readonly string[]): Promise<void>
  /** Spec 039: the observation facts of a session. */
  ofSession(sessionId: string): Promise<UsabilityFact[]>
  /** Spec 039: the task facts of a study. */
  tasksOf(studyId: string): Promise<UsabilityFact[]>
  ofStudies(studyIds: readonly string[]): Promise<UsabilityFact[]>
  byIds(ids: readonly string[]): Promise<UsabilityFact[]>
}

export type UsabilityFactDeps = {
  readonly store: UsabilityFactStore
  readonly knownNames: (accountId: string, studyId: string) => Promise<readonly string[]>
  readonly translate: (
    accountId: string,
    ref: string,
    input: { text: string; from: 'en' | 'fr'; to: 'en' | 'fr' },
  ) => Promise<string>
  readonly enqueueTranslation: (job: TranslateJob & { usability: true }) => Promise<boolean>
  readonly clock: { now(): Date }
  readonly newId: () => string
  readonly log: { warn(object: object, message: string): void }
}
