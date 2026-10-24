import { type Clock, err, ok, type Result } from '@goodresearch/shared'
import type { Account, AccountError } from '../../domain/account.ts'
import type { Actor, Role, TeamId } from '../../domain/actor.ts'
import type { WorkspaceRepositories, WorkspaceUnitOfWork } from '../ports.ts'

export type AccountCommandError = AccountError | 'MEMBER_NOT_FOUND' | 'TEAM_NOT_FOUND'

/**
 * Admin commands on accounts (FR-013, FR-014). Members get MEMBER_NOT_FOUND, as if the members area
 * did not exist. Each command changes one account and appends its access events in one transaction.
 */
export const makeAccountCommands = (deps: { uow: WorkspaceUnitOfWork; clock: Clock }) => {
  const run = (
    actor: Actor,
    accountId: string,
    change: (
      account: Account,
      repositories: WorkspaceRepositories,
      now: Date,
    ) => Promise<Result<void, AccountCommandError>>,
  ): Promise<Result<void, AccountCommandError>> =>
    deps.uow(async (repositories) => {
      if (actor.role !== 'admin') return err('MEMBER_NOT_FOUND')
      const account = await repositories.accounts.findById(accountId)
      if (!account) return err('MEMBER_NOT_FOUND')
      const changed = await change(account, repositories, deps.clock.now())
      if (!changed.ok) return changed
      await repositories.accounts.save(account)
      return ok(undefined)
    })

  const team = async (repositories: WorkspaceRepositories, teamId: string) => {
    const found = await repositories.teams.findById(teamId as TeamId)
    return found ? { id: found.id, name: found.name } : null
  }

  return {
    grantTeamAccess: (c: { actor: Actor; accountId: string; teamId: string }) =>
      run(c.actor, c.accountId, async (account, repositories, now) => {
        const found = await team(repositories, c.teamId)
        return found ? account.grantTeam(found, c.actor.id, now) : err('TEAM_NOT_FOUND')
      }),

    removeTeamAccess: (c: { actor: Actor; accountId: string; teamId: string }) =>
      run(c.actor, c.accountId, async (account, repositories, now) => {
        const found = await team(repositories, c.teamId)
        return found ? account.removeTeam(found, c.actor.id, now) : err('TEAM_NOT_FOUND')
      }),

    changeRole: (c: { actor: Actor; accountId: string; role: Role }) =>
      run(c.actor, c.accountId, async (account, repositories, now) =>
        account.changeRole(c.role, c.actor.id, now, await repositories.accounts.lockActiveAdmins()),
      ),

    deactivateAccount: (c: { actor: Actor; accountId: string }) =>
      run(c.actor, c.accountId, async (account, repositories, now) =>
        account.deactivate(c.actor.id, now, await repositories.accounts.lockActiveAdmins()),
      ),

    reactivateAccount: (c: { actor: Actor; accountId: string }) =>
      run(c.actor, c.accountId, async (account, _repositories, now) =>
        account.reactivate(c.actor.id, now),
      ),

    deleteAccount: (c: { actor: Actor; accountId: string; confirmation: string }) =>
      run(c.actor, c.accountId, async (account, repositories, now) =>
        account.delete(
          c.confirmation,
          c.actor.id,
          now,
          await repositories.accounts.lockActiveAdmins(),
        ),
      ),
  }
}

export type AccountCommands = ReturnType<typeof makeAccountCommands>
