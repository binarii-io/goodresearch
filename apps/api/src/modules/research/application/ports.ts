import type { Clock } from '@goodresearch/shared'
import type { ProjectRepository } from '../domain/project.repository.ts'
import type { StudyRepository } from '../domain/study.repository.ts'

/** Access rules come from the workspace module's public API (wired in the composition root). */
export type AccessContext = {
  readonly role: 'admin' | 'member'
  readonly teamIds: readonly string[]
}

export type TeamDirectory = {
  getAccessContext(accountId: string): Promise<AccessContext | null>
  teamExists(teamId: string): Promise<boolean>
}

export type ResearchRepositories = {
  readonly projects: ProjectRepository
  readonly studies: StudyRepository
}

export type ResearchUnitOfWork = <T>(
  work: (repositories: ResearchRepositories) => Promise<T>,
) => Promise<T>

export type ResearchCommandDeps = {
  readonly uow: ResearchUnitOfWork
  readonly clock: Clock
  readonly teams: TeamDirectory
}

export type ProjectRunGate = {
  /** Spec 019: an insight or recommendation run is not finished on this project. */
  isRunning(projectId: string): Promise<boolean>
}

/**
 * Whether a person may act on a study beyond seeing it: implemented by the ingestion module, which
 * checks the person's own access to the study's source folder (spec 002 FR-010a).
 */
export type StudyActionGate = {
  canAct(accountId: string, studyId: string): Promise<boolean>
}
