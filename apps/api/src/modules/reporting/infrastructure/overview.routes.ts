import { ProjectOverview, ProjectOverviewCosts, ProjectParams } from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
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
}
