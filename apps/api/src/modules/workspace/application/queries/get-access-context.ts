import { eq } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { Role } from '../../domain/actor.ts'
import { workspaceTeamMemberships } from '../../infrastructure/schema.ts'

/** What an account may access: admins every team, members their teams (FR-011). */
export type AccessContext = {
  readonly accountId: string
  readonly role: Role
  /** Teams the account belongs to (an admin may access teams outside this list). */
  readonly teamIds: readonly string[]
}

export const makeGetAccessContext =
  (db: Db) =>
  async (accountId: string): Promise<AccessContext | null> => {
    const [account] = await db
      .select({ role: auth_users.role, status: auth_users.status })
      .from(auth_users)
      .where(eq(auth_users.id, accountId))
    if (account?.status !== 'active') return null
    const memberships = await db
      .select({ teamId: workspaceTeamMemberships.teamId })
      .from(workspaceTeamMemberships)
      .where(eq(workspaceTeamMemberships.accountId, accountId))
    return {
      accountId,
      role: account.role === 'admin' ? 'admin' : 'member',
      teamIds: memberships.map((m) => m.teamId),
    }
  }
