import type { AccountRepository } from '../domain/account.repository.ts'
import type { TeamRepository } from '../domain/team.repository.ts'

export type WorkspaceRepositories = {
  readonly teams: TeamRepository
  readonly accounts: AccountRepository
}

/** Runs `work` in one transaction; repositories are bound to it. */
export type WorkspaceUnitOfWork = <T>(
  work: (repositories: WorkspaceRepositories) => Promise<T>,
) => Promise<T>

/** Project counts come from the research module (wired in the composition root). */
export type ProjectCounter = { countByTeam(teamId: string): Promise<number> }
