import {
  ProjectOverview,
  ProjectOverviewCosts,
  ProjectParams,
  TeamStudiesCosts,
  TeamStudiesOverview,
  TeamStudiesQuery,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { reply } from '#platform/http/result.ts'
import type { ReportingHandlers } from './module.ts'

/** Spec 017 routes: where a project stands, for its Overview tab. */
export const registerOverviewRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: ReportingHandlers },
): void => {
  const queries = deps.handlers.overviewQueries
  const api = app.withTypeProvider<ZodTypeProvider>()
  api.get(
    '/api/projects/:projectId/overview',
    {
      preHandler: deps.guard,
      schema: {
        operationId: 'getProjectOverview',
        tags: ['projects'],
        params: ProjectParams,
        response: { 200: ProjectOverview },
      },
    },
    async (request, res) =>
      reply(res, await queries.get(request.account.id, request.params.projectId), (v) =>
        res.send(v),
      ),
  )
  api.get(
    '/api/projects/:projectId/overview/costs',
    {
      preHandler: deps.guard,
      schema: {
        operationId: 'getProjectOverviewCosts',
        tags: ['projects'],
        params: ProjectParams,
        response: { 200: ProjectOverviewCosts },
      },
    },
    async (request, res) =>
      reply(res, await queries.costs(request.account.id, request.params.projectId), (v) =>
        res.send(v),
      ),
  )
  const TeamParams = z.object({ teamId: z.string() })
  const TeamFilter = TeamStudiesQuery.pick({ q: true })
  api.get(
    '/api/teams/:teamId/studies/overview',
    {
      preHandler: deps.guard,
      schema: {
        operationId: 'getTeamStudiesOverview',
        tags: ['studies'],
        params: TeamParams,
        querystring: TeamFilter,
        response: { 200: TeamStudiesOverview },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.teamStudies(request.account.id, request.params.teamId, request.query),
        (v) => res.send(v),
      ),
  )
  api.get(
    '/api/teams/:teamId/studies/overview/costs',
    {
      preHandler: deps.guard,
      schema: {
        operationId: 'getTeamStudiesCosts',
        tags: ['studies'],
        params: TeamParams,
        querystring: TeamFilter,
        response: { 200: TeamStudiesCosts },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.teamStudiesCosts(request.account.id, request.params.teamId, request.query),
        (v) => res.send(v),
      ),
  )
}
