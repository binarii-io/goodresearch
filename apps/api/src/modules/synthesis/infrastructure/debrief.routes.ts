import {
  DebriefQuery,
  DebriefView,
  InsightsParams,
  PublishDebrief,
  PublishedDeck,
  UpdateDebrief,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { SynthesisHandlers } from './http.routes.ts'

/** Spec 015 routes: the project's Debrief tab and its Google Slides copy. */
export const registerDebriefRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: SynthesisHandlers },
): void => {
  const { debrief, debriefQueries: queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['debrief']
  const base = '/api/projects/:projectId/debrief'

  api.get(
    base,
    {
      ...secured,
      schema: {
        operationId: 'getDebrief',
        tags,
        params: InsightsParams,
        querystring: DebriefQuery,
        response: { 200: DebriefView },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.get(request.account.id, request.params.projectId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/publication`,
    {
      ...secured,
      schema: {
        operationId: 'publishDebrief',
        tags,
        params: InsightsParams,
        body: PublishDebrief,
        response: { 201: PublishedDeck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await debrief.publish(request.account.id, request.params.projectId, request.body),
        (v) => res.status(201).send(v),
      ),
  )

  api.put(
    `${base}/publication`,
    {
      ...secured,
      schema: {
        operationId: 'updateDebrief',
        tags,
        params: InsightsParams,
        body: UpdateDebrief,
        response: { 200: PublishedDeck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await debrief.update(request.account.id, request.params.projectId, request.body),
        (v) => res.send(v),
      ),
  )
}
