import type { ProjectDetail, ProjectSummary } from '@goodresearch/contracts'
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { researchProjects } from '../../infrastructure/schema.ts'
import type { TeamDirectory } from '../ports.ts'

export type TeamNames = (teamIds: readonly string[]) => Promise<ReadonlyMap<string, string>>

/** Read side of projects: SQL straight to DTOs, restricted to what the account can access. */
export const makeProjectQueries = (deps: {
  db: Db
  teams: TeamDirectory
  teamNames: TeamNames
}) => {
  const { db } = deps

  const scope = async (accountId: string): Promise<SQL | undefined | 'none'> => {
    const access = await deps.teams.getAccessContext(accountId)
    if (!access) return 'none'
    if (access.role === 'admin') return undefined
    return access.teamIds.length > 0
      ? inArray(researchProjects.teamId, [...access.teamIds])
      : 'none'
  }

  return {
    listProjects: async (
      accountId: string,
      filter: { team?: string | undefined },
    ): Promise<ProjectSummary[]> => {
      const visible = await scope(accountId)
      if (visible === 'none') return []
      const rows = await db
        .select({
          id: researchProjects.id,
          name: researchProjects.name,
          teamId: researchProjects.teamId,
          updatedAt: researchProjects.updatedAt,
        })
        .from(researchProjects)
        .where(and(visible, filter.team ? eq(researchProjects.teamId, filter.team) : undefined))
        .orderBy(desc(researchProjects.updatedAt))
      const names = await deps.teamNames([...new Set(rows.map((r) => r.teamId))])
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        team: { id: r.teamId, name: names.get(r.teamId) ?? '' },
        updatedAt: r.updatedAt.toISOString(),
      }))
    },

    getProject: async (accountId: string, projectId: string): Promise<ProjectDetail | null> => {
      const visible = await scope(accountId)
      if (visible === 'none') return null
      const [row] = await db
        .select()
        .from(researchProjects)
        .where(and(eq(researchProjects.id, projectId), visible))
      if (!row) return null
      const names = await deps.teamNames([row.teamId])
      return {
        id: row.id,
        name: row.name,
        goal: row.goal,
        team: { id: row.teamId, name: names.get(row.teamId) ?? '' },
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
      }
    },

    countProjectsByTeams: async (
      teamIds: readonly string[],
    ): Promise<ReadonlyMap<string, number>> => {
      if (teamIds.length === 0) return new Map()
      const rows = await db
        .select({ teamId: researchProjects.teamId, value: count() })
        .from(researchProjects)
        .where(inArray(researchProjects.teamId, [...teamIds]))
        .groupBy(researchProjects.teamId)
      return new Map(rows.map((r) => [r.teamId, r.value]))
    },

    countProjectsByTeam: async (teamId: string): Promise<number> => {
      const [row] = await db
        .select({ value: count() })
        .from(researchProjects)
        .where(eq(researchProjects.teamId, teamId))
      return row?.value ?? 0
    },
  }
}

export type ProjectQueries = ReturnType<typeof makeProjectQueries>
