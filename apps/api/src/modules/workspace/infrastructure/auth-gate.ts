import type { Clock } from '@goodresearch/shared'
import { newId } from '@goodresearch/shared'
import { and, eq } from 'drizzle-orm'
import type { AuthGate } from '#platform/auth/auth.ts'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { authorizeSignIn, roleForNewAccount, type SignInRules } from '../domain/sign-in-policy.ts'
import { workspaceAccessEvents } from './schema.ts'

/** Connects the auth library to the workspace sign-in rules and access history. */
export const createAuthGate = (deps: { db: Db; rules: SignInRules; clock: Clock }): AuthGate => {
  const { db, rules, clock } = deps
  const roleOf = async (accountId: string) => {
    const [row] = await db
      .select({ role: auth_users.role })
      .from(auth_users)
      .where(eq(auth_users.id, accountId))
    return row?.role === 'admin' ? ('admin' as const) : row ? ('member' as const) : undefined
  }

  return {
    authorize: async (attempt) =>
      authorizeSignIn(rules, {
        action: attempt.action,
        email: attempt.email,
        emailVerified: attempt.emailVerified,
        providerTrusted: attempt.providerTrusted,
        existingRole: attempt.accountId ? await roleOf(attempt.accountId) : undefined,
      }),

    roleForNewAccount: (email) => roleForNewAccount(rules, email),

    onAccountCreated: async (accountId) => {
      const [existing] = await db
        .select({ id: workspaceAccessEvents.id })
        .from(workspaceAccessEvents)
        .where(
          and(
            eq(workspaceAccessEvents.subjectId, accountId),
            eq(workspaceAccessEvents.type, 'account_created'),
          ),
        )
        .limit(1)
      if (existing) return
      const role = await roleOf(accountId)
      await db.insert(workspaceAccessEvents).values({
        id: newId(),
        occurredAt: clock.now(),
        actorId: null,
        subjectId: accountId,
        type: 'account_created',
        details: { role },
      })
    },

    isActive: async (accountId) => {
      const [row] = await db
        .select({ status: auth_users.status })
        .from(auth_users)
        .where(eq(auth_users.id, accountId))
      return row?.status === 'active'
    },

    onSignedIn: async (accountId) => {
      await db
        .update(auth_users)
        .set({ lastSignInAt: clock.now() })
        .where(eq(auth_users.id, accountId))
    },
  }
}
