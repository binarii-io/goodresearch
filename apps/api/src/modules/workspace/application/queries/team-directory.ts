import { and, eq, inArray, ne } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { workspaceTeamMemberships, workspaceTeams } from '../../infrastructure/schema.ts'

/** Team and member lookups other modules need (through the public index), without exposing tables. */
export const makeTeamDirectory = (db: Db) => ({
  teamExists: async (teamId: string): Promise<boolean> => {
    const [row] = await db
      .select({ id: workspaceTeams.id })
      .from(workspaceTeams)
      .where(eq(workspaceTeams.id, teamId))
    return row !== undefined
  },
  teamNames: async (teamIds: readonly string[]): Promise<ReadonlyMap<string, string>> => {
    if (teamIds.length === 0) return new Map()
    const rows = await db
      .select({ id: workspaceTeams.id, name: workspaceTeams.name })
      .from(workspaceTeams)
      .where(inArray(workspaceTeams.id, [...teamIds]))
    return new Map(rows.map((r) => [r.id, r.name]))
  },
  /** Whether every id is an account of the workspace that was not deleted (spec 008 roster). */
  membersExist: async (ids: readonly string[]): Promise<boolean> => {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return true
    const rows = await db
      .select({ id: auth_users.id })
      .from(auth_users)
      .where(and(inArray(auth_users.id, unique), ne(auth_users.status, 'deleted')))
    return rows.length === unique.length
  },
  /**
   * Active members of a team, for the app's rules that tell interviewers apart (spec 009 research
   * R12). Names stay in the app: they are never sent to an AI provider.
   */
  membersOfTeam: async (teamId: string): Promise<{ id: string; name: string }[]> =>
    db
      .select({ id: auth_users.id, name: auth_users.name })
      .from(workspaceTeamMemberships)
      .innerJoin(auth_users, eq(auth_users.id, workspaceTeamMemberships.accountId))
      .where(and(eq(workspaceTeamMemberships.teamId, teamId), eq(auth_users.status, 'active'))),
})
