import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { sendError } from './errors.ts'

export type OwnedKind = 'study' | 'project' | 'session' | 'publication' | 'planned' | 'team'

const OWNED: readonly (readonly [string, OwnedKind])[] = [
  ['studyId', 'study'],
  ['projectId', 'project'],
  ['sessionId', 'session'],
  ['publicationId', 'publication'],
  ['plannedInterviewId', 'planned'],
]

/**
 * Spec 026 contracts/access.md: the reads open to every active member. Anything else on what a team
 * owns stays with the team and admins, so a new route is closed until it is listed here.
 */
export const OPEN_READS: ReadonlySet<string> = new Set([
  '/api/projects/:projectId',
  '/api/projects/:projectId/studies',
  '/api/projects/:projectId/overview',
  '/api/projects/:projectId/overview/costs',
  '/api/projects/:projectId/insights',
  '/api/projects/:projectId/insights/:insightId',
  '/api/projects/:projectId/insight-facts',
  '/api/projects/:projectId/recommendations',
  '/api/projects/:projectId/recommendations/:recommendationId',
  '/api/projects/:projectId/recommendation-insights',
  '/api/projects/:projectId/takeaways/freshness',
  '/api/projects/:projectId/debrief',
  '/api/studies/:studyId',
  '/api/studies/:studyId/guide',
  '/api/studies/:studyId/questionnaire',
  '/api/studies/:studyId/source',
  '/api/studies/:studyId/facts',
  '/api/teams/:teamId/studies',
  '/api/teams/:teamId/studies/overview',
  '/api/teams/:teamId/studies/overview/costs',
])

export type AccessGuardDeps = {
  readonly session: preHandlerAsyncHookHandler
  readonly access: (
    accountId: string,
  ) => Promise<{ role: 'admin' | 'member'; teamIds: readonly string[] } | null>
  /** The team owning a resource; null when it does not exist, for the use case to answer. */
  readonly owner: (kind: OwnedKind, id: string) => Promise<{ id: string; name: string } | null>
}

const ownedBy = (request: FastifyRequest): readonly [OwnedKind, string] | null => {
  const params = request.params as Record<string, string | undefined>
  for (const [param, kind] of OWNED) {
    const id = params[param]
    if (id) return [kind, id]
  }
  // A team's management keeps its own rules; only what it owns is guarded here.
  const url = request.routeOptions.url ?? ''
  return params.teamId && url.startsWith('/api/teams/:teamId/studies')
    ? ['team', params.teamId]
    : null
}

/** The session guard, then spec 026's rule: only the owning team and admins go further. */
export const createAccessGuard = (deps: AccessGuardDeps): preHandlerAsyncHookHandler =>
  async function accessGuard(request, reply) {
    await deps.session.call(this, request, reply)
    if (reply.sent) return
    const read = request.method === 'GET' || request.method === 'HEAD'
    if (read && OPEN_READS.has(request.routeOptions.url ?? '')) return
    const owned = ownedBy(request)
    if (!owned) return
    const team = await deps.owner(owned[0], owned[1])
    if (!team) return
    const access = await deps.access(request.account.id)
    if (access?.role === 'admin' || access?.teamIds.includes(team.id)) return
    return sendError(reply, 'READ_ONLY', { team })
  }
