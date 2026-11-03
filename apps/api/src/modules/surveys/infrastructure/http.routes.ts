import {
  ERROR_CODES,
  type ErrorCode,
  ReadResponses,
  ResponseDetail,
  ResponseParams,
  ResponsesPage,
  ResponsesQuery,
  ResponsesSummary,
  SaveTargetRule,
  StudyParams,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sendError } from '#platform/http/errors.ts'
import type { SurveyCommands } from '../application/commands/survey-commands.ts'
import type { ResponseQueries } from '../application/queries/response-queries.ts'

export type SurveysHandlers = {
  readonly commands: SurveyCommands
  readonly queries: ResponseQueries
}

const code = (error: string): ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(error) ? (error as ErrorCode) : 'INTERNAL'

const send = <T>(
  res: FastifyReply,
  result: { ok: true; value: T } | { ok: false; error: string },
  onOk: (value: T) => FastifyReply,
): FastifyReply => (result.ok ? onOk(result.value) : sendError(res, code(result.error)))

/** Spec 028: reserved to the owning team and admins by the access guard (none is an open read). */
export const registerSurveysRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: SurveysHandlers },
): void => {
  const { commands, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['surveys']

  api.get(
    '/api/studies/:studyId/responses/summary',
    {
      ...secured,
      schema: {
        operationId: 'getResponsesSummary',
        tags,
        params: StudyParams,
        response: { 200: ResponsesSummary },
      },
    },
    async (request, res) =>
      send(res, await queries.summary(request.account.id, request.params.studyId), (v) =>
        res.send(v as never),
      ),
  )

  api.post(
    '/api/studies/:studyId/responses/read',
    {
      ...secured,
      schema: {
        operationId: 'readResponses',
        tags,
        params: StudyParams,
        body: ReadResponses,
      },
    },
    async (request, res) =>
      send(
        res,
        await commands.read({
          actor: request.account,
          studyId: request.params.studyId,
          force: request.body.force,
        }),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/responses',
    {
      ...secured,
      schema: {
        operationId: 'listResponses',
        tags,
        params: StudyParams,
        querystring: ResponsesQuery,
        response: { 200: ResponsesPage },
      },
    },
    async (request, res) =>
      send(
        res,
        await queries.page(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/responses/:responseId',
    {
      ...secured,
      schema: {
        operationId: 'getResponse',
        tags,
        params: ResponseParams,
        response: { 200: ResponseDetail },
      },
    },
    async (request, res) =>
      send(
        res,
        await queries.detail(request.account.id, request.params.studyId, request.params.responseId),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/studies/:studyId/target-rule',
    {
      ...secured,
      schema: {
        operationId: 'saveTargetRule',
        tags,
        params: StudyParams,
        body: SaveTargetRule,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      send(
        res,
        await commands.saveRule({
          actor: request.account,
          studyId: request.params.studyId,
          accepted: request.body.accepted,
          version: request.body.version,
          origin: 'person',
        }),
        (v) => res.send(v),
      ),
  )
}
