import {
  AcceptFacts,
  AddVerbatim,
  AttributeSpeaker,
  Created,
  CreateFact,
  CreateSurveyFact,
  DecideFact,
  DecideSurveyFact,
  FactParams,
  FactsBulkResult,
  FactsEstimate,
  FactsEstimateQuery,
  FactsInterviewParams,
  FactsOverview,
  FactsPage,
  FactsQuery,
  FactsReadingParams,
  FactsRunParams,
  FactsRunStarted,
  InterviewFacts,
  ResizeVerbatim,
  StartFactsRun,
  StudyParams,
  SurveyFact,
  SurveyFactFigure,
  SurveyFactsFindEstimate,
  SurveyFactsFound,
  SurveyFactsPage,
  SurveyFactsQuery,
  VerbatimParams,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { AnalysisCommands } from '../application/commands/analysis-commands.ts'
import type { FactCommands } from '../application/commands/fact-commands.ts'
import type { SurveyFactCommands } from '../application/commands/survey-fact-commands.ts'
import type { AnalysisQueries } from '../application/queries/analysis-queries.ts'
import type { makeSurveyFactQueries } from '../application/queries/survey-fact-queries.ts'
import type { SurveyFact as SurveyFactModel } from '../domain/survey-facts.ts'

export type EvidenceHandlers = {
  analysis: AnalysisCommands
  facts: FactCommands
  queries: AnalysisQueries
  /** Spec 029: facts of survey studies. */
  surveyFacts: SurveyFactCommands
  surveyFactQueries: ReturnType<typeof makeSurveyFactQueries>
}

/** Spec 012 routes: the Analysis tab, its runs, an interview's facts, the study's facts. */
export const registerEvidenceRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: EvidenceHandlers },
): void => {
  const { analysis, facts, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['analysis']
  api.get(
    '/api/studies/:studyId/facts-analysis',
    {
      ...secured,
      schema: {
        operationId: 'getFactsOverview',
        tags,
        params: StudyParams,
        response: { 200: FactsOverview },
      },
    },
    async (request, res) =>
      reply(res, await queries.overview(request.account.id, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/facts-runs/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateFactsRun',
        tags,
        params: StudyParams,
        querystring: FactsEstimateQuery,
        response: { 200: FactsEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await analysis.estimate(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-runs',
    {
      ...secured,
      schema: {
        operationId: 'startFactsRun',
        tags,
        params: StudyParams,
        body: StartFactsRun,
        response: { 202: FactsRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await analysis.start(request.account.id, request.params.studyId, request.body),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-runs/consent',
    { ...secured, schema: { operationId: 'giveFactsConsent', tags, params: StudyParams } },
    async (request, res) =>
      reply(res, await analysis.giveConsent(request.account.id, request.params.studyId), () =>
        res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-runs/:runId/stop',
    { ...secured, schema: { operationId: 'stopFactsRun', tags, params: FactsRunParams } },
    async (request, res) =>
      reply(
        res,
        await analysis.stop(request.account.id, request.params.studyId, request.params.runId),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-runs/:runId/sessions/:sessionId/stop',
    {
      ...secured,
      schema: { operationId: 'stopFactsReading', tags, params: FactsReadingParams },
    },
    async (request, res) =>
      reply(
        res,
        await analysis.stopSession(
          request.account.id,
          request.params.studyId,
          request.params.runId,
          request.params.sessionId,
        ),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/facts-analysis/:sessionId',
    {
      ...secured,
      schema: {
        operationId: 'getInterviewFacts',
        tags,
        params: FactsInterviewParams,
        response: { 200: InterviewFacts },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.interview(
          request.account.id,
          request.params.studyId,
          request.params.sessionId,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-analysis/:sessionId/verbatims',
    {
      ...secured,
      schema: {
        operationId: 'addVerbatim',
        tags,
        params: FactsInterviewParams,
        body: AddVerbatim,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await facts.addVerbatim(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body,
        ),
        (v) => res.status(201).send({ id: v.id }),
      ),
  )

  api.patch(
    '/api/studies/:studyId/facts-analysis/:sessionId/verbatims/:verbatimId',
    {
      ...secured,
      schema: { operationId: 'resizeVerbatim', tags, params: VerbatimParams, body: ResizeVerbatim },
    },
    async (request, res) =>
      reply(
        res,
        await facts.resizeVerbatim(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.params.verbatimId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts-analysis/:sessionId/verbatims/:verbatimId/set-aside',
    { ...secured, schema: { operationId: 'setVerbatimAside', tags, params: VerbatimParams } },
    async (request, res) =>
      reply(
        res,
        await facts.setAside(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.params.verbatimId,
        ),
        () => res.status(204).send(),
      ),
  )

  api.put(
    '/api/studies/:studyId/facts-analysis/:sessionId/speakers',
    {
      ...secured,
      schema: {
        operationId: 'attributeSpeaker',
        tags,
        params: FactsInterviewParams,
        body: AttributeSpeaker,
      },
    },
    async (request, res) =>
      reply(
        res,
        await facts.attributeSpeaker(
          request.account,
          request.params.studyId,
          request.params.sessionId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/facts',
    {
      ...secured,
      schema: {
        operationId: 'listFacts',
        tags,
        params: StudyParams,
        querystring: FactsQuery,
        response: { 200: FactsPage },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.factsPage(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts',
    {
      ...secured,
      schema: {
        operationId: 'createFact',
        tags,
        params: StudyParams,
        body: CreateFact,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(res, await facts.create(request.account, request.params.studyId, request.body), (v) =>
        res.status(201).send({ id: v.id }),
      ),
  )

  api.patch(
    '/api/studies/:studyId/facts/:factId',
    {
      ...secured,
      schema: { operationId: 'decideFact', tags, params: FactParams, body: DecideFact },
    },
    async (request, res) =>
      reply(
        res,
        await facts.decide(
          request.account,
          request.params.studyId,
          request.params.factId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts/accept',
    {
      ...secured,
      schema: {
        operationId: 'acceptFacts',
        tags,
        params: StudyParams,
        body: AcceptFacts,
        response: { 200: FactsBulkResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await facts.acceptMany(request.account, request.params.studyId, request.body.facts),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/facts/:factId/translate',
    { ...secured, schema: { operationId: 'translateFact', tags, params: FactParams } },
    async (request, res) =>
      reply(
        res,
        await facts.retryTranslation(
          request.account,
          request.params.studyId,
          request.params.factId,
        ),
        () => res.status(204).send(),
      ),
  )

  // Spec 029: facts of a survey study, made from a figure or an accepted theme.
  const { surveyFacts, surveyFactQueries } = deps.handlers

  api.get(
    '/api/studies/:studyId/survey-facts',
    {
      ...secured,
      schema: {
        operationId: 'listSurveyFacts',
        tags,
        params: StudyParams,
        querystring: SurveyFactsQuery,
        response: { 200: SurveyFactsPage },
      },
    },
    async (request, res) =>
      reply(
        res,
        await surveyFactQueries.page(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/survey-facts',
    {
      ...secured,
      schema: {
        operationId: 'createSurveyFact',
        tags,
        params: StudyParams,
        body: CreateSurveyFact,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await surveyFacts.create(request.account, request.params.studyId, request.body),
        (v) => res.status(201).send({ id: v.id }),
      ),
  )

  // FR-010a: "Find facts" of a survey study, as the interview one: an estimate, then the call.
  api.get(
    '/api/studies/:studyId/survey-facts/find/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateSurveyFactsFind',
        tags,
        params: StudyParams,
        response: { 200: SurveyFactsFindEstimate },
      },
    },
    async (request, res) =>
      reply(res, await surveyFacts.estimateFind(request.account, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/survey-facts/find',
    {
      ...secured,
      schema: {
        operationId: 'findSurveyFacts',
        tags,
        params: StudyParams,
        response: { 200: SurveyFactsFound },
      },
    },
    async (request, res) =>
      reply(res, await surveyFacts.find(request.account, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.patch(
    '/api/studies/:studyId/survey-facts/:factId',
    {
      ...secured,
      schema: {
        operationId: 'decideSurveyFact',
        tags,
        params: FactParams,
        body: DecideSurveyFact,
        response: { 200: SurveyFact },
      },
    },
    async (request, res) =>
      reply(
        res,
        await surveyFacts.decide(
          request.account,
          request.params.studyId,
          request.params.factId,
          request.body,
        ),
        (v) => res.send(toView(v)),
      ),
  )

  api.post(
    '/api/studies/:studyId/survey-facts/:factId/figure',
    {
      ...secured,
      schema: {
        operationId: 'updateSurveyFactFigure',
        tags,
        params: FactParams,
        body: SurveyFactFigure,
        response: { 200: SurveyFact },
      },
    },
    async (request, res) =>
      reply(
        res,
        await surveyFacts.figure(
          request.account,
          request.params.studyId,
          request.params.factId,
          request.body,
        ),
        (v) => res.send(toView(v)),
      ),
  )
}

/** A survey fact as a decision returns it: today's figure is read again by the list. */
const toView = (f: SurveyFactModel) => ({
  id: f.id,
  statement: f.statement,
  translation: f.translation,
  polarity: f.polarity,
  theme: f.theme,
  support:
    f.support.kind === 'figure'
      ? {
          kind: 'figure' as const,
          itemId: f.support.itemId,
          itemText: '',
          figure: f.support.figure,
        }
      : {
          kind: 'theme' as const,
          itemId: f.support.itemId,
          itemText: '',
          themeId: f.support.themeId,
          share: f.support.share,
          quotes: [...f.support.quotes],
        },
  figureChanged: null,
  itemRemoved: false,
  origin: f.origin,
  status: f.status,
  decidedBy: f.decidedBy ? { id: f.decidedBy, name: null } : null,
  decidedAt: f.decidedAt?.toISOString() ?? null,
  version: f.version,
})
