import type { Project } from './project.ts'

export { ConcurrencyError } from '@goodresearch/shared'

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>
  /** Inserts or updates with optimistic locking; throws `ConcurrencyError` on a stale version. */
  save(project: Project): Promise<void>
  /** What belongs to the project goes with it; its studies stay (spec 020). */
  delete(id: string): Promise<void>
}
