import {
  Created,
  CreateRecommendation,
  DecideRecommendation,
  DraftTakeaways,
  EditRecommendation,
  InsightRunParams,
  InsightRunStarted,
  InsightsParams,
  InsightsToLink,
  InsightsToLinkQuery,
  InsightVersion,
  InsightVersionQuery,
  RecommendationDetail,
  RecommendationInsightParams,
  RecommendationParams,
  RecommendationRunEstimate,
  RecommendationRunRequest,
  RecommendationsBulkResult,
  RecommendationsOverview,
  RecommendationsQuery,
  SaveTakeaways,
  StartRecommendationRun,
  TakeawaysEstimate,
  TakeawaysEstimateRequest,
  ValidateRecommendations,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { SynthesisHandlers } from './http.routes.ts'

const version = <T extends { version: number }>(v: T) => ({ version: v.version })

/** Spec 014 routes: the project's Recommendations tab, its runs, a recommendation, the takeaways. */
export const registerRecommendationRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: SynthesisHandlers },
): void => {
  const { recommendationRuns: runs, recommendations, takeaways } = deps.handlers
  const queries = deps.handlers.recommendationQueries
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['recommendations']
  const base = '/api/projects/:projectId'

  api.get(
    `${base}/recommendations`,
    {
      ...secured,
      schema: {
        operationId: 'getRecommendations',
        tags,
        params: InsightsParams,
        querystring: RecommendationsQuery,
        response: { 200: RecommendationsOverview },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.overview(request.account.id, request.params.projectId, request.query),
        (v) => res.send(v),
      ),
  )

  api.get(
    `${base}/recommendations/:recommendationId`,
    {
      ...secured,
      schema: {
        operationId: 'getRecommendation',
        tags,
        params: RecommendationParams,
        response: { 200: RecommendationDetail },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.detail(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
        ),
        (v) => res.send(v),
      ),
  )

  api.get(
    `${base}/recommendation-insights`,
    {
      ...secured,
      schema: {
        operationId: 'listInsightsToLink',
        tags,
        params: InsightsParams,
        querystring: InsightsToLinkQuery,
        response: { 200: InsightsToLink },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.insightsToLink(request.account.id, request.params.projectId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/recommendations`,
    {
      ...secured,
      schema: {
        operationId: 'createRecommendation',
        tags,
        params: InsightsParams,
        body: CreateRecommendation,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.create(request.account.id, request.params.projectId, request.body),
        (v) => res.status(201).send({ id: v.id }),
      ),
  )

  api.patch(
    `${base}/recommendations/:recommendationId`,
    {
      ...secured,
      schema: {
        operationId: 'editRecommendation',
        tags,
        params: RecommendationParams,
        body: EditRecommendation,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.edit(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.body,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/recommendations/:recommendationId/decision`,
    {
      ...secured,
      schema: {
        operationId: 'decideRecommendation',
        tags,
        params: RecommendationParams,
        body: DecideRecommendation,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.decide(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.body,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/recommendations/decisions`,
    {
      ...secured,
      schema: {
        operationId: 'validateRecommendations',
        tags,
        params: InsightsParams,
        body: ValidateRecommendations,
        response: { 200: RecommendationsBulkResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.validateMany(
          request.account.id,
          request.params.projectId,
          request.body.recommendations,
        ),
        (v) => res.send(v),
      ),
  )

  api.put(
    `${base}/recommendations/:recommendationId/insights/:insightId`,
    {
      ...secured,
      schema: {
        operationId: 'linkInsight',
        tags,
        params: RecommendationInsightParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.link(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.params.insightId,
          request.body.version,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.delete(
    `${base}/recommendations/:recommendationId/insights/:insightId`,
    {
      ...secured,
      schema: {
        operationId: 'unlinkInsight',
        tags,
        params: RecommendationInsightParams,
        querystring: InsightVersionQuery,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.unlink(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.params.insightId,
          request.query.version,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/recommendations/:recommendationId/reviewed`,
    {
      ...secured,
      schema: {
        operationId: 'markRecommendationReviewed',
        tags,
        params: RecommendationParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.reviewed(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.body.version,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/recommendations/:recommendationId/translation`,
    {
      ...secured,
      schema: {
        operationId: 'retryRecommendationTranslation',
        tags,
        params: RecommendationParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await recommendations.retryTranslation(
          request.account.id,
          request.params.projectId,
          request.params.recommendationId,
          request.body.version,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/recommendation-runs/estimate`,
    {
      ...secured,
      schema: {
        operationId: 'estimateRecommendationRun',
        tags,
        params: InsightsParams,
        body: RecommendationRunRequest,
        response: { 200: RecommendationRunEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await runs.estimate(request.account.id, request.params.projectId, request.body),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/recommendation-runs`,
    {
      ...secured,
      schema: {
        operationId: 'startRecommendationRun',
        tags,
        params: InsightsParams,
        body: StartRecommendationRun,
        response: { 202: InsightRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await runs.start(request.account.id, request.params.projectId, request.body),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    `${base}/recommendation-runs/:runId/stop`,
    {
      ...secured,
      schema: { operationId: 'stopRecommendationRun', tags, params: InsightRunParams },
    },
    async (request, res) =>
      reply(
        res,
        await runs.stop(request.account.id, request.params.projectId, request.params.runId),
        () => res.status(204).send(),
      ),
  )

  api.patch(
    `${base}/takeaways`,
    {
      ...secured,
      schema: {
        operationId: 'saveTakeaways',
        tags,
        params: InsightsParams,
        body: SaveTakeaways,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await takeaways.save(request.account.id, request.params.projectId, request.body),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/takeaways/estimate`,
    {
      ...secured,
      schema: {
        operationId: 'estimateTakeawaysDraft',
        tags,
        params: InsightsParams,
        body: TakeawaysEstimateRequest,
        response: { 200: TakeawaysEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await takeaways.estimate(request.account.id, request.params.projectId, request.body),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/takeaways/draft`,
    {
      ...secured,
      schema: { operationId: 'draftTakeaways', tags, params: InsightsParams, body: DraftTakeaways },
    },
    async (request, res) =>
      reply(
        res,
        await takeaways.draft(request.account.id, request.params.projectId, request.body),
        () => res.status(202).send(),
      ),
  )

  api.post(
    `${base}/takeaways/translation`,
    {
      ...secured,
      schema: {
        operationId: 'retryTakeawaysTranslation',
        tags,
        params: InsightsParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await takeaways.retryTranslation(
          request.account.id,
          request.params.projectId,
          request.body.version,
        ),
        (v) => res.send(v),
      ),
  )
}
