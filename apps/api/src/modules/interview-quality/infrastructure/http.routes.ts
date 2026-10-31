import {
  QualityEstimate,
  QualityEstimateQuery,
  QualityInterview,
  QualityInterviewParams,
  QualityOverview,
  QualityRunParams,
  QualityRunStarted,
  ReformulationList,
  ReformulationParams,
  ReformulationsQuery,
  RemarkList,
  RemarkParams,
  RemarkRequalified,
  RemarksQuery,
  RemarkVersionQuery,
  Requalify,
  SetStance,
  StartQualityRun,
  StudyParams,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { RemarkCommands } from '../application/commands/remark-commands.ts'
import type { ReviewCommands } from '../application/commands/review-commands.ts'
import type { QualityQueries } from '../application/queries/quality-queries.ts'

export type QualityHandlers = {
  review: ReviewCommands
  remarks: RemarkCommands
  queries: QualityQueries
}

/** Spec 016 routes: the Quality tab and its reviews. Every handler checks study access. */
export const registerQualityRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: QualityHandlers },
): void => {
  const { review, remarks, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['quality']
  api.get(
    '/api/studies/:studyId/quality',
    {
      ...secured,
      schema: {
        operationId: 'getQualityOverview',
        tags,
        params: StudyParams,
        response: { 200: QualityOverview },
      },
    },
    async (request, res) =>
      reply(res, await queries.overview(request.account.id, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/quality/interviews/:sessionId',
    {
      ...secured,
      schema: {
        operationId: 'getQualityInterview',
        tags,
        params: QualityInterviewParams,
        response: { 200: QualityInterview },
      },
    },
    async (request, res) => {
      const { studyId, sessionId } = request.params
      await review.importToRead(request.account.id, studyId, sessionId)
      return reply(res, await queries.interview(request.account.id, studyId, sessionId), (v) =>
        res.send(v),
      )
    },
  )

  api.get(
    '/api/studies/:studyId/quality/remarks',
    {
      ...secured,
      schema: {
        operationId: 'listQualityRemarks',
        tags,
        params: StudyParams,
        querystring: RemarksQuery,
        response: { 200: RemarkList },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.remarks(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/studies/:studyId/quality/remarks/:remarkId/stance',
    {
      ...secured,
      schema: {
        operationId: 'setRemarkStance',
        tags,
        params: RemarkParams,
        body: SetStance,
      },
    },
    async (request, res) =>
      reply(
        res,
        await remarks.stance(
          request.account.id,
          request.params.studyId,
          request.params.remarkId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.delete(
    '/api/studies/:studyId/quality/remarks/:remarkId',
    {
      ...secured,
      schema: {
        operationId: 'withdrawRemark',
        tags,
        params: RemarkParams,
        querystring: RemarkVersionQuery,
      },
    },
    async (request, res) =>
      reply(
        res,
        await remarks.withdraw(
          request.account.id,
          request.params.studyId,
          request.params.remarkId,
          request.query.version,
        ),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/quality/reformulations',
    {
      ...secured,
      schema: {
        operationId: 'listSimpleReformulations',
        tags,
        params: StudyParams,
        querystring: ReformulationsQuery,
        response: { 200: ReformulationList },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.reformulations(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/quality/reformulations/:reformulationId/requalify',
    {
      ...secured,
      schema: {
        operationId: 'requalifyReformulation',
        tags,
        params: ReformulationParams,
        body: Requalify,
        response: { 201: RemarkRequalified },
      },
    },
    async (request, res) =>
      reply(
        res,
        await remarks.requalify(
          request.account.id,
          request.params.studyId,
          request.params.reformulationId,
          request.body,
        ),
        (v) => res.status(201).send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/quality-runs/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateQualityRun',
        tags,
        params: StudyParams,
        querystring: QualityEstimateQuery,
        response: { 200: QualityEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await review.estimate(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/quality-runs',
    {
      ...secured,
      schema: {
        operationId: 'startQualityRun',
        tags,
        params: StudyParams,
        body: StartQualityRun,
        response: { 202: QualityRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await review.start(request.account.id, request.params.studyId, request.body),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/quality-runs/consent',
    { ...secured, schema: { operationId: 'giveQualityConsent', tags, params: StudyParams } },
    async (request, res) =>
      reply(res, await review.giveConsent(request.account.id, request.params.studyId), () =>
        res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/quality-runs/:runId/stop',
    { ...secured, schema: { operationId: 'stopQualityRun', tags, params: QualityRunParams } },
    async (request, res) =>
      reply(
        res,
        await review.stop(request.account.id, request.params.studyId, request.params.runId),
        () => res.status(204).send(),
      ),
  )
}
