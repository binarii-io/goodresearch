import {
  AddCorrection,
  BulkCorrections,
  BulkCorrectionsResult,
  Cleaning,
  CleaningEstimate,
  CleaningEstimateQuery,
  CleaningRunParams,
  CleaningRunStarted,
  CleanPublished,
  CleanVersionCreated,
  CorrectionAdded,
  CorrectionParams,
  DecideCorrection,
  InterviewCleaning,
  InterviewCleaningParams,
  InterviewCleaningQuery,
  PublishClean,
  StartCleaningRun,
  StudyParams,
  ValidateClean,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { CleaningCommands } from '../application/commands/cleaning-commands.ts'
import type { CleaningQueries } from '../application/queries/cleaning-queries.ts'

/** Spec 011 routes: the Cleaning view, its runs, the review of an interview and publishing. */
export const registerCleaningRoutes = (
  app: FastifyInstance,
  deps: {
    guard: preHandlerAsyncHookHandler
    cleaning: CleaningCommands
    queries: CleaningQueries
  },
): void => {
  const { cleaning, queries } = deps
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['enrichment']

  api.get(
    '/api/studies/:studyId/cleaning',
    {
      ...secured,
      schema: {
        operationId: 'getCleaning',
        tags,
        params: StudyParams,
        response: { 200: Cleaning },
      },
    },
    async (request, res) =>
      reply(res, await queries.cleaningList(request.account.id, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/cleaning-runs/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateCleaningRun',
        tags,
        params: StudyParams,
        querystring: CleaningEstimateQuery,
        response: { 200: CleaningEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.estimate(
          request.account.id,
          request.params.studyId,
          request.query.mode,
          request.query.all,
          request.query.sessionId,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning-runs',
    {
      ...secured,
      schema: {
        operationId: 'startCleaningRun',
        tags,
        params: StudyParams,
        body: StartCleaningRun,
        response: { 202: CleaningRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.startCleaning(request.account, request.params.studyId, request.body),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning-runs/:runId/stop',
    { ...secured, schema: { operationId: 'stopCleaningRun', tags, params: CleaningRunParams } },
    async (request, res) =>
      reply(
        res,
        await cleaning.stopCleaning(request.account, request.params.studyId, request.params.runId),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/cleaning/:sessionId',
    {
      ...secured,
      schema: {
        operationId: 'getInterviewCleaning',
        tags,
        params: InterviewCleaningParams,
        querystring: InterviewCleaningQuery,
        response: { 200: InterviewCleaning },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.interviewCleaning(
          request.account.id,
          request.params.studyId,
          request.params.sessionId,
          request.query,
        ),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/studies/:studyId/cleaning/:sessionId/corrections/:key',
    {
      ...secured,
      schema: {
        operationId: 'decideCorrection',
        tags,
        params: CorrectionParams,
        body: DecideCorrection,
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.decideCorrection(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.params.key,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning/:sessionId/corrections',
    {
      ...secured,
      schema: {
        operationId: 'addCorrection',
        tags,
        params: InterviewCleaningParams,
        body: AddCorrection,
        response: { 201: CorrectionAdded },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.addCorrection(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body,
        ),
        (v) => res.status(201).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning/:sessionId/decisions',
    {
      ...secured,
      schema: {
        operationId: 'decideCorrections',
        tags,
        params: InterviewCleaningParams,
        body: BulkCorrections,
        response: { 200: BulkCorrectionsResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.decideMany(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body.keys,
          request.body.decision,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning/:sessionId/versions',
    {
      ...secured,
      schema: {
        operationId: 'validateClean',
        tags,
        params: InterviewCleaningParams,
        body: ValidateClean,
        response: { 201: CleanVersionCreated },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.validateClean(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body.fingerprint,
        ),
        (v) => res.status(201).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/cleaning/:sessionId/publish',
    {
      ...secured,
      schema: {
        operationId: 'publishClean',
        tags,
        params: InterviewCleaningParams,
        body: PublishClean,
        response: { 200: CleanPublished },
      },
    },
    async (request, res) =>
      reply(
        res,
        await cleaning.publishClean(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body,
        ),
        (v) => res.send(v),
      ),
  )
}
