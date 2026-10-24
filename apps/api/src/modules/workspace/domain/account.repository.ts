import type { Account, AdminCount } from './account.ts'

export interface AccountRepository {
  findById(id: string): Promise<Account | null>
  /** Counts active admins and locks them until the transaction ends (prevents concurrent demotions). */
  lockActiveAdmins(): Promise<AdminCount>
  /** Persists status, role and memberships, ends sessions when required, appends the access events. */
  save(account: Account): Promise<void>
  /** Members of a team, for team deletion. */
  findByTeam(teamId: string): Promise<Account[]>
}
