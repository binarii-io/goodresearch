import type { AccessHistoryEntry, Member, TeamDetail } from '@goodresearch/contracts'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { auth_accounts, auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import {
  workspaceAccessEvents,
  workspaceTeamMemberships,
  workspaceTeams,
} from '../../infrastructure/schema.ts'

export type ProjectCountsByTeam = (
  teamIds: readonly string[],
) => Promise<ReadonlyMap<string, number>>

/** Read side of members, access history and teams (SQL straight to DTOs). */
export const makeMemberQueries = (deps: { db: Db; projectCounts: ProjectCountsByTeam }) => {
  const { db } = deps

  return {
    listMembers: async (): Promise<Member[]> => {
      const users = await db.select().from(auth_users).orderBy(asc(auth_users.name))
      const memberships = await db
        .select({
          accountId: workspaceTeamMemberships.accountId,
          id: workspaceTeams.id,
          name: workspaceTeams.name,
        })
        .from(workspaceTeamMemberships)
        .innerJoin(workspaceTeams, eq(workspaceTeams.id, workspaceTeamMemberships.teamId))
        .orderBy(asc(workspaceTeams.nameKey))
      const providers = await db
        .select({ userId: auth_accounts.userId, providerId: auth_accounts.providerId })
        .from(auth_accounts)
      return users.map((user) => {
        const deleted = user.status === 'deleted'
        return {
          id: user.id,
          name: deleted ? null : user.name,
          email: deleted ? null : user.email,
          role: user.role === 'admin' ? 'admin' : 'member',
          status: user.status as Member['status'],
          teams: memberships
            .filter((m) => m.accountId === user.id)
            .map(({ id, name }) => ({ id, name })),
          provider: providers.find((p) => p.userId === user.id)?.providerId ?? null,
          lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
        }
      })
    },

    getAccessHistory: async (accountId: string): Promise<AccessHistoryEntry[] | null> => {
      const [subject] = await db
        .select({ id: auth_users.id })
        .from(auth_users)
        .where(eq(auth_users.id, accountId))
      if (!subject) return null
      const actor = alias(auth_users, 'actor')
      const rows = await db
        .select({
          occurredAt: workspaceAccessEvents.occurredAt,
          actorId: workspaceAccessEvents.actorId,
          actorName: actor.name,
          actorStatus: actor.status,
          type: workspaceAccessEvents.type,
          details: workspaceAccessEvents.details,
        })
        .from(workspaceAccessEvents)
        .leftJoin(actor, eq(actor.id, workspaceAccessEvents.actorId))
        .where(eq(workspaceAccessEvents.subjectId, accountId))
        .orderBy(desc(workspaceAccessEvents.occurredAt), desc(workspaceAccessEvents.id))
      return rows.map((r) => ({
        occurredAt: r.occurredAt.toISOString(),
        actor: r.actorId
          ? { id: r.actorId, name: r.actorStatus === 'deleted' ? null : r.actorName }
          : null,
        type: r.type as AccessHistoryEntry['type'],
        details: r.details,
      }))
    },

    /** Admins: every team; members: their teams (FR-023). */
    listTeams: async (viewer: { id: string; role: 'admin' | 'member' }): Promise<TeamDetail[]> => {
      const own =
        viewer.role === 'admin'
          ? undefined
          : (
              await db
                .select({ teamId: workspaceTeamMemberships.teamId })
                .from(workspaceTeamMemberships)
                .where(eq(workspaceTeamMemberships.accountId, viewer.id))
            ).map((r) => r.teamId)
      if (own && own.length === 0) return []
      const teams = await db
        .select()
        .from(workspaceTeams)
        .where(own ? inArray(workspaceTeams.id, own) : undefined)
        .orderBy(asc(workspaceTeams.nameKey))
      const ids = teams.map((t) => t.id)
      const members =
        ids.length === 0
          ? []
          : await db
              .select({
                teamId: workspaceTeamMemberships.teamId,
                id: auth_users.id,
                name: auth_users.name,
              })
              .from(workspaceTeamMemberships)
              .innerJoin(auth_users, eq(auth_users.id, workspaceTeamMemberships.accountId))
              .where(inArray(workspaceTeamMemberships.teamId, ids))
              .orderBy(asc(auth_users.name))
      const counts = await deps.projectCounts(ids)
      return teams.map((t) => ({
        id: t.id,
        name: t.name,
        version: t.version,
        members: members.filter((m) => m.teamId === t.id).map(({ id, name }) => ({ id, name })),
        projectCount: counts.get(t.id) ?? 0,
      }))
    },
  }
}

export type MemberQueries = ReturnType<typeof makeMemberQueries>
