import { newId } from '@goodresearch/shared'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { auth_accounts, auth_sessions, auth_users } from '#platform/auth/auth-schema.ts'
import type { Executor } from '#platform/db.ts'
import type { AccountRepository } from '../domain/account.repository.ts'
import { Account, type AccountStatus } from '../domain/account.ts'
import type { AccountId } from '../domain/actor.ts'
import { workspaceAccessEvents, workspaceTeamMemberships } from './schema.ts'

/** Unique, non-routable placeholder: the auth table requires a unique email (FR-014b). */
const anonymisedEmail = (id: string) => `deleted-${id}@deleted.invalid`

const load = async (tx: Executor, ids: readonly string[]): Promise<Account[]> => {
  if (ids.length === 0) return []
  const users = await tx
    .select()
    .from(auth_users)
    .where(inArray(auth_users.id, [...ids]))
  const memberships = await tx
    .select()
    .from(workspaceTeamMemberships)
    .where(inArray(workspaceTeamMemberships.accountId, [...ids]))
  return users.map((user) => {
    const status = user.status as AccountStatus
    return Account.fromPersistence({
      id: user.id as AccountId,
      name: status === 'deleted' ? null : user.name,
      email: status === 'deleted' ? null : user.email,
      role: user.role === 'admin' ? 'admin' : 'member',
      status,
      teamIds: memberships.filter((m) => m.accountId === user.id).map((m) => m.teamId),
    })
  })
}

export const drizzleAccountRepository = (tx: Executor): AccountRepository => ({
  findById: async (id) => (await load(tx, [id]))[0] ?? null,

  lockActiveAdmins: async () => {
    const admins = await tx
      .select({ id: auth_users.id })
      .from(auth_users)
      .where(and(eq(auth_users.role, 'admin'), eq(auth_users.status, 'active')))
      .for('update')
    return { activeAdmins: admins.length }
  },

  findByTeam: async (teamId) => {
    const rows = await tx
      .select({ accountId: workspaceTeamMemberships.accountId })
      .from(workspaceTeamMemberships)
      .where(eq(workspaceTeamMemberships.teamId, teamId))
    return load(
      tx,
      rows.map((r) => r.accountId),
    )
  },

  save: async (account) => {
    const p = account.snapshot()
    const events = account.pullEvents()
    const deleted = p.status === 'deleted'
    await tx
      .update(auth_users)
      .set({
        role: p.role,
        status: p.status,
        ...(deleted
          ? { name: '', email: anonymisedEmail(p.id), emailVerified: false, image: null }
          : {}),
      })
      .where(eq(auth_users.id, p.id))

    await tx
      .delete(workspaceTeamMemberships)
      .where(
        p.teamIds.length > 0
          ? and(
              eq(workspaceTeamMemberships.accountId, p.id),
              notInArray(workspaceTeamMemberships.teamId, [...p.teamIds]),
            )
          : eq(workspaceTeamMemberships.accountId, p.id),
      )
    for (const event of events.filter((e) => e.type === 'membership_granted')) {
      await tx
        .insert(workspaceTeamMemberships)
        .values({
          teamId: String(event.details.teamId),
          accountId: p.id,
          grantedAt: event.occurredAt,
          grantedBy: event.actorId,
        })
        .onConflictDoNothing()
    }

    if (account.sessionsMustEnd)
      await tx.delete(auth_sessions).where(eq(auth_sessions.userId, p.id))
    // A deleted person signing in again gets a new, unrelated account.
    if (deleted) await tx.delete(auth_accounts).where(eq(auth_accounts.userId, p.id))

    if (events.length > 0) {
      await tx.insert(workspaceAccessEvents).values(
        events.map((e) => ({
          id: newId(),
          occurredAt: e.occurredAt,
          actorId: e.actorId,
          subjectId: e.subjectId,
          type: e.type,
          details: e.details,
        })),
      )
    }
  },
})
