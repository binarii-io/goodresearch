import { ConcurrencyError } from '@goodresearch/shared'
import type { WorkspaceRepositories, WorkspaceUnitOfWork } from '../../application/ports.ts'
import type { AccessEvent } from '../../domain/access-event.ts'
import type { AccountRepository } from '../../domain/account.repository.ts'
import { Account, type AccountProps } from '../../domain/account.ts'
import type { AccountId, TeamId } from '../../domain/actor.ts'
import type { TeamRepository } from '../../domain/team.repository.ts'
import { Team } from '../../domain/team.ts'

/** In-memory implementation of the workspace ports, for use-case tests (fakes, not mocks). */
export class InMemoryWorkspace {
  readonly teams = new Map<string, Team>()
  readonly accounts = new Map<string, AccountProps>()
  readonly events: AccessEvent[] = []
  readonly revokedSessions: string[] = []

  addAccount(account: Omit<Partial<AccountProps>, 'id'> & { id: string }): void {
    this.accounts.set(account.id, {
      name: account.id,
      email: `${account.id}@example.org`,
      role: 'member',
      status: 'active',
      teamIds: [],
      ...account,
      id: account.id as AccountId,
    })
  }

  addTeam(team: { id: string; name: string }): void {
    const now = new Date(0)
    this.teams.set(
      team.id,
      Team.fromPersistence({
        id: team.id as TeamId,
        name: team.name,
        createdAt: now,
        updatedAt: now,
        version: 0,
      }),
    )
  }

  readonly teamRepository: TeamRepository = {
    findById: async (id) => {
      const team = this.teams.get(id)
      return team ? Team.fromPersistence(team.snapshot()) : null
    },
    existsByNameKey: async (nameKey, exceptId) =>
      [...this.teams.values()].some((t) => t.nameKey === nameKey && t.id !== exceptId),
    save: async (team) => {
      const stored = this.teams.get(team.id)
      if (stored && stored.version !== team.version) throw new ConcurrencyError()
      this.teams.set(
        team.id,
        Team.fromPersistence({ ...team.snapshot(), version: team.version + (stored ? 1 : 0) }),
      )
    },
    delete: async (id) => {
      this.teams.delete(id)
    },
  }

  readonly accountRepository: AccountRepository = {
    findById: async (id) => {
      const props = this.accounts.get(id)
      return props ? Account.fromPersistence(props) : null
    },
    lockActiveAdmins: async () => ({
      activeAdmins: [...this.accounts.values()].filter(
        (a) => a.role === 'admin' && a.status === 'active',
      ).length,
    }),
    save: async (account) => {
      this.accounts.set(account.id, account.snapshot())
      if (account.sessionsMustEnd) this.revokedSessions.push(account.id)
      this.events.push(...account.pullEvents())
    },
    findByTeam: async (teamId) =>
      [...this.accounts.values()]
        .filter((a) => a.teamIds.includes(teamId))
        .map((a) => Account.fromPersistence(a)),
  }

  readonly uow: WorkspaceUnitOfWork = (work) => {
    const repositories: WorkspaceRepositories = {
      teams: this.teamRepository,
      accounts: this.accountRepository,
    }
    return work(repositories)
  }
}
