import { and, eq, ne, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { TeamId } from '../domain/actor.ts'
import { ConcurrencyError, type TeamRepository } from '../domain/team.repository.ts'
import { Team } from '../domain/team.ts'
import { workspaceTeams } from './schema.ts'

export const drizzleTeamRepository = (tx: Executor): TeamRepository => ({
  findById: async (id) => {
    const [row] = await tx.select().from(workspaceTeams).where(eq(workspaceTeams.id, id))
    return row
      ? Team.fromPersistence({
          id: row.id as TeamId,
          name: row.name,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          version: row.version,
        })
      : null
  },

  existsByNameKey: async (nameKey, exceptId) => {
    const [row] = await tx
      .select({ id: workspaceTeams.id })
      .from(workspaceTeams)
      .where(
        exceptId
          ? and(eq(workspaceTeams.nameKey, nameKey), ne(workspaceTeams.id, exceptId))
          : eq(workspaceTeams.nameKey, nameKey),
      )
      .limit(1)
    return row !== undefined
  },

  save: async (team) => {
    const p = team.snapshot()
    const updated = await tx
      .update(workspaceTeams)
      .set({
        name: p.name,
        nameKey: team.nameKey,
        updatedAt: p.updatedAt,
        version: sql`${workspaceTeams.version} + 1`,
      })
      .where(and(eq(workspaceTeams.id, p.id), eq(workspaceTeams.version, p.version)))
      .returning({ id: workspaceTeams.id })
    if (updated.length > 0) return
    const inserted = await tx
      .insert(workspaceTeams)
      .values({
        id: p.id,
        name: p.name,
        nameKey: team.nameKey,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        version: 0,
      })
      .onConflictDoNothing({ target: workspaceTeams.id })
      .returning({ id: workspaceTeams.id })
    if (inserted.length === 0) throw new ConcurrencyError()
  },

  delete: async (id) => {
    await tx.delete(workspaceTeams).where(eq(workspaceTeams.id, id))
  },
})
