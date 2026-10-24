import type { Clock } from '@goodresearch/shared'
import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import type { Db } from '../db.ts'
import { sendError } from '../http/errors.ts'
import type { Auth } from './auth.ts'
import { auth_sessions } from './auth-schema.ts'

/** Hard limit after sign-in, whatever the activity (FR-009); the auth library only handles inactivity. */
const ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000

export type CurrentAccount = { readonly id: string; readonly role: 'admin' | 'member' }

declare module 'fastify' {
  interface FastifyRequest {
    account: CurrentAccount
  }
}

export const createSessionGuard = (deps: {
  auth: Auth
  db: Db
  clock: Clock
}): preHandlerAsyncHookHandler =>
  async function sessionGuard(request: FastifyRequest, reply: FastifyReply) {
    const result = await deps.auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!result) return sendError(reply, 'UNAUTHENTICATED')
    const { session, user } = result
    if (deps.clock.now().getTime() - new Date(session.createdAt).getTime() > ABSOLUTE_SESSION_MS) {
      await deps.db.delete(auth_sessions).where(eq(auth_sessions.id, session.id))
      return sendError(reply, 'UNAUTHENTICATED')
    }
    if (user.status !== 'active') return sendError(reply, 'UNAUTHENTICATED')
    request.account = { id: user.id, role: user.role === 'admin' ? 'admin' : 'member' }
  }
