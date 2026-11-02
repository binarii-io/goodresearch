import type { ProjectDetail, ProjectSummary } from '@goodresearch/contracts'
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { canDeleteProject, relationTo } from '../../domain/relation.ts'
import { researchProjects } from '../../infrastructure/schema.ts'
import type { AccessContext, TeamDirectory } from '../ports.ts'

export type TeamNames = (teamIds: readonly string[]) => Promise<ReadonlyMap<string, string>>

/** Read side of projects: SQL straight to DTOs, restricted to what the account can access. */
const ALL_TEAMS_PAGE = 50

export const makeProjectQueries = (deps: {
  db: Db
  teams: TeamDirectory
  teamNames: TeamNames
}) => {
  const { db } = deps

  const scopeOf = (access: AccessContext | null): SQL | undefined | 'none' => {
    if (!access) return 'none'
    if (access.role === 'admin') return undefined
    return access.teamIds.length > 0
      ? inArray(researchProjects.teamId, [...access.teamIds])
      : 'none'
  }

  const detail = async (accountId: string, projectId: string): Promise<ProjectDetail | null> => {
    const access = await deps.teams.getAccessContext(accountId)
    if (!access) return null
    const [row] = await db.select().from(researchProjects).where(eq(researchProjects.id, projectId))
    if (!row) return null
    const names = await deps.teamNames([row.teamId])
    return {
      id: row.id,
      name: row.name,
      goal: row.goal,
      team: { id: row.teamId, name: names.get(row.teamId) ?? '' },
      canChange: relationTo(access, row.teamId) === 'team',
      canDelete: canDeleteProject(access, accountId, row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    }
  }

  return {
    listProjects: async (
      accountId: string,
      filter: {
        team?: string | undefined
        teams?: 'mine' | 'all' | undefined
        limit?: number | undefined
      },
    ): Promise<ProjectSummary[]> => {
      const access = await deps.teams.getAccessContext(accountId)
      if (!access) return []
      // Spec 026: every active member can list every team's projects.
      const visible = filter.teams === 'all' ? undefined : scopeOf(access)
      if (visible === 'none') return []
      const query = db
        .select({
          id: researchProjects.id,
          name: researchProjects.name,
          teamId: researchProjects.teamId,
          updatedAt: researchProjects.updatedAt,
        })
        .from(researchProjects)
        .where(and(visible, filter.team ? eq(researchProjects.teamId, filter.team) : undefined))
        .orderBy(desc(researchProjects.updatedAt))
        .$dynamic()
      // Every team's projects can be many: only what the screen shows (FR-022).
      const rows = await (filter.teams === 'all'
        ? query.limit(filter.limit ?? ALL_TEAMS_PAGE)
        : query)
      const names = await deps.teamNames([...new Set(rows.map((r) => r.teamId))])
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        team: { id: r.teamId, name: names.get(r.teamId) ?? '' },
        canChange: relationTo(access, r.teamId) === 'team',
        updatedAt: r.updatedAt.toISOString(),
      }))
    },

    /** The project for what changes it or needs its team: team and admins only. */
    getProject: async (accountId: string, projectId: string): Promise<ProjectDetail | null> => {
      const project = await detail(accountId, projectId)
      return project?.canChange ? project : null
    },

    /** Spec 026: the project for reading, open to every active member. */
    readProject: (accountId: string, projectId: string): Promise<ProjectDetail | null> =>
      detail(accountId, projectId),

    /** Spec 026: the team owning a project, and its name; null when there is none. */
    teamOfProject: async (projectId: string): Promise<{ id: string; name: string } | null> => {
      const [row] = await db
        .select({ teamId: researchProjects.teamId })
        .from(researchProjects)
        .where(eq(researchProjects.id, projectId))
      if (!row) return null
      const names = await deps.teamNames([row.teamId])
      return { id: row.teamId, name: names.get(row.teamId) ?? '' }
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
