import type { Me } from '@goodresearch/contracts'
import { asc, eq } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { workspaceTeamMemberships, workspaceTeams } from '../../infrastructure/schema.ts'

/** Shown in the browser: only a valid https address from the provider (same rule as `Me.picture`). */
const httpsUrl = (value: string | null): string | null => {
  if (!value || !URL.canParse(value)) return null
  return new URL(value).protocol === 'https:' ? value : null
}

/** The signed-in account and the teams it can work in (admins: all teams). */
export const makeGetMe =
  (db: Db) =>
  async (accountId: string): Promise<Me | null> => {
    const [account] = await db.select().from(auth_users).where(eq(auth_users.id, accountId))
    if (!account) return null
    const role = account.role === 'admin' ? 'admin' : 'member'
    const teams =
      role === 'admin'
        ? await db
            .select({ id: workspaceTeams.id, name: workspaceTeams.name })
            .from(workspaceTeams)
            .orderBy(asc(workspaceTeams.nameKey))
        : await db
            .select({ id: workspaceTeams.id, name: workspaceTeams.name })
            .from(workspaceTeamMemberships)
            .innerJoin(workspaceTeams, eq(workspaceTeams.id, workspaceTeamMemberships.teamId))
            .where(eq(workspaceTeamMemberships.accountId, accountId))
            .orderBy(asc(workspaceTeams.nameKey))
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      picture: httpsUrl(account.image),
      role,
      language: account.language === 'fr' ? 'fr' : 'en',
      teams,
    }
  }
