import { eq, inArray } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { workspaceTeams } from '../../infrastructure/schema.ts'

/** Team lookups other modules need (through the public index), without exposing tables. */
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
})
