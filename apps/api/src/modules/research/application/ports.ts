import type { Clock } from '@goodresearch/shared'
import type { ProjectRepository } from '../domain/project.repository.ts'

/** Access rules come from the workspace module's public API (wired in the composition root). */
export type AccessContext = {
  readonly role: 'admin' | 'member'
  readonly teamIds: readonly string[]
}

export type TeamDirectory = {
  getAccessContext(accountId: string): Promise<AccessContext | null>
  teamExists(teamId: string): Promise<boolean>
}

export type ResearchRepositories = { readonly projects: ProjectRepository }

export type ResearchUnitOfWork = <T>(
  work: (repositories: ResearchRepositories) => Promise<T>,
) => Promise<T>

export type ResearchCommandDeps = {
  readonly uow: ResearchUnitOfWork
  readonly clock: Clock
  readonly teams: TeamDirectory
}
