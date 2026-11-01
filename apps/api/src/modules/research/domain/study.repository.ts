import type { Study } from './study.ts'

export interface StudyRepository {
  findById(id: string): Promise<Study | null>
  findByProject(projectId: string): Promise<Study[]>
  /** Inserts or updates with optimistic locking; throws `ConcurrencyError` on a stale version. */
  save(study: Study): Promise<void>
  delete(id: string): Promise<void>
}
