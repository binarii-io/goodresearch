import {
  Created,
  CreateInsight,
  DecideInsight,
  EditInsight,
  InsightDetail,
  InsightFactParams,
  InsightParams,
  InsightRunEstimate,
  InsightRunParams,
  InsightRunRequest,
  InsightRunStarted,
  InsightsBulkResult,
  InsightsOverview,
  InsightsParams,
  InsightsQuery,
  InsightVersion,
  InsightVersionQuery,
  LinkFact,
  ProjectFactsPage,
  ProjectFactsQuery,
  StartInsightRun,
  ValidateInsights,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { makeInsightCommands } from '../application/commands/insight-commands.ts'
import type { makeInsightRunCommands } from '../application/commands/insight-run-commands.ts'
import type { makeRecommendationCommands } from '../application/commands/recommendation-commands.ts'
import type { makeRecommendationRunCommands } from '../application/commands/recommendation-run-commands.ts'
import type { makeTakeawaysCommands } from '../application/commands/takeaways-commands.ts'
import type { makeInsightQueries } from '../application/queries/insight-queries.ts'
import type { makeRecommendationQueries } from '../application/queries/recommendation-queries.ts'

export type SynthesisHandlers = {
  runs: ReturnType<typeof makeInsightRunCommands>
  insights: ReturnType<typeof makeInsightCommands>
  queries: ReturnType<typeof makeInsightQueries>
  recommendationRuns: ReturnType<typeof makeRecommendationRunCommands>
  recommendations: ReturnType<typeof makeRecommendationCommands>
  takeaways: ReturnType<typeof makeTakeawaysCommands>
  recommendationQueries: ReturnType<typeof makeRecommendationQueries>
}

const version = <T extends { version: number }>(v: T) => ({ version: v.version })

/** Spec 013 routes: the project's Insights tab, its runs, an insight and the facts panel. */
export const registerSynthesisRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: SynthesisHandlers },
): void => {
  const { runs, insights, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['insights']
  const base = '/api/projects/:projectId'

  api.get(
    `${base}/insights`,
    {
      ...secured,
      schema: {
        operationId: 'getInsights',
        tags,
        params: InsightsParams,
        querystring: InsightsQuery,
        response: { 200: InsightsOverview },
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
    `${base}/insights/:insightId`,
    {
      ...secured,
      schema: {
        operationId: 'getInsight',
        tags,
        params: InsightParams,
        response: { 200: InsightDetail },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.detail(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/insights`,
    {
      ...secured,
      schema: {
        operationId: 'createInsight',
        tags,
        params: InsightsParams,
        body: CreateInsight,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.create(request.account.id, request.params.projectId, request.body),
        (v) => res.status(201).send({ id: v.id }),
      ),
  )

  api.patch(
    `${base}/insights/:insightId`,
    {
      ...secured,
      schema: {
        operationId: 'editInsight',
        tags,
        params: InsightParams,
        body: EditInsight,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.edit(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.body,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/insights/:insightId/decision`,
    {
      ...secured,
      schema: {
        operationId: 'decideInsight',
        tags,
        params: InsightParams,
        body: DecideInsight,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.decide(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.body,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/insights/decisions`,
    {
      ...secured,
      schema: {
        operationId: 'validateInsights',
        tags,
        params: InsightsParams,
        body: ValidateInsights,
        response: { 200: InsightsBulkResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.validateMany(
          request.account.id,
          request.params.projectId,
          request.body.insights,
        ),
        (v) => res.send(v),
      ),
  )

  api.put(
    `${base}/insights/:insightId/facts/:factId`,
    {
      ...secured,
      schema: {
        operationId: 'linkFact',
        tags,
        params: InsightFactParams,
        body: LinkFact,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.link(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.params.factId,
          request.body,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.delete(
    `${base}/insights/:insightId/facts/:factId`,
    {
      ...secured,
      schema: {
        operationId: 'unlinkFact',
        tags,
        params: InsightFactParams,
        querystring: InsightVersionQuery,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.unlink(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.params.factId,
          request.query.version,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/insights/:insightId/reviewed`,
    {
      ...secured,
      schema: {
        operationId: 'markInsightReviewed',
        tags,
        params: InsightParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.reviewed(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.body.version,
        ),
        (v) => res.send(version(v)),
      ),
  )

  api.post(
    `${base}/insights/:insightId/translation`,
    {
      ...secured,
      schema: {
        operationId: 'retryInsightTranslation',
        tags,
        params: InsightParams,
        body: InsightVersion,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await insights.retryTranslation(
          request.account.id,
          request.params.projectId,
          request.params.insightId,
          request.body.version,
        ),
        (v) => res.send(v),
      ),
  )

  api.get(
    `${base}/insight-facts`,
    {
      ...secured,
      schema: {
        operationId: 'listInsightFacts',
        tags,
        params: InsightsParams,
        querystring: ProjectFactsQuery,
        response: { 200: ProjectFactsPage },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.facts(request.account.id, request.params.projectId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    `${base}/insight-runs/estimate`,
    {
      ...secured,
      schema: {
        operationId: 'estimateInsightRun',
        tags,
        params: InsightsParams,
        body: InsightRunRequest,
        response: { 200: InsightRunEstimate },
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
    `${base}/insight-runs`,
    {
      ...secured,
      schema: {
        operationId: 'startInsightRun',
        tags,
        params: InsightsParams,
        body: StartInsightRun,
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
    `${base}/insight-runs/:runId/stop`,
    { ...secured, schema: { operationId: 'stopInsightRun', tags, params: InsightRunParams } },
    async (request, res) =>
      reply(
        res,
        await runs.stop(request.account.id, request.params.projectId, request.params.runId),
        () => res.status(204).send(),
      ),
  )
}
