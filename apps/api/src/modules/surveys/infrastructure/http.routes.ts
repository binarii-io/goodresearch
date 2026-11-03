import {
  DecideSurveyTheme,
  ERROR_CODES,
  type ErrorCode,
  MergeSurveyThemes,
  MoveOpenAnswer,
  OpenAnswersPage,
  OpenAnswersQuery,
  OpenItemParams,
  ReadResponses,
  ResponseDetail,
  ResponseParams,
  ResponsesPage,
  ResponsesQuery,
  ResponsesSummary,
  SaveTargetRule,
  StartThemesRun,
  StudyParams,
  SurveyAnalysis,
  SurveyAnalysisQuery,
  SurveyThemeParams,
  SurveyThemes,
  ThemesEstimate,
  ThemesEstimateQuery,
  ThemesRunStarted,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sendError } from '#platform/http/errors.ts'
import type { SurveyCommands } from '../application/commands/survey-commands.ts'
import type { ThemeCommands } from '../application/commands/theme-commands.ts'
import type { makeFigureQueries } from '../application/queries/figure-queries.ts'
import type { ResponseQueries } from '../application/queries/response-queries.ts'
import type { makeThemeQueries } from '../application/queries/theme-queries.ts'

export type SurveysHandlers = {
  readonly commands: SurveyCommands
  readonly queries: ResponseQueries
  readonly figures: ReturnType<typeof makeFigureQueries>
  readonly themes: ReturnType<typeof makeThemeQueries>
  readonly themeCommands: ThemeCommands
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
  const { commands, queries, figures, themes, themeCommands } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['surveys']

  // Spec 029 US3: an open item's masked answers and themes.
  api.get(
    '/api/studies/:studyId/open-items/:itemId/answers',
    {
      ...secured,
      schema: {
        operationId: 'listOpenAnswers',
        tags,
        params: OpenItemParams,
        querystring: OpenAnswersQuery,
        response: { 200: OpenAnswersPage },
      },
    },
    async (request, res) =>
      send(
        res,
        await themes.answers(
          request.account.id,
          request.params.studyId,
          request.params.itemId,
          request.query,
        ),
        (v) => res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/open-items/:itemId/themes',
    {
      ...secured,
      schema: {
        operationId: 'listSurveyThemes',
        tags,
        params: OpenItemParams,
        response: { 200: SurveyThemes },
      },
    },
    async (request, res) =>
      send(
        res,
        await themes.list(request.account.id, request.params.studyId, request.params.itemId),
        (v) => res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/open-items/:itemId/themes/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateThemesRun',
        tags,
        params: OpenItemParams,
        querystring: ThemesEstimateQuery,
        response: { 200: ThemesEstimate },
      },
    },
    async (request, res) =>
      send(
        res,
        await themeCommands.estimate(
          request.account,
          request.params.studyId,
          request.params.itemId,
          request.query.onlyNew,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/open-items/:itemId/themes/runs',
    {
      ...secured,
      schema: {
        operationId: 'startThemesRun',
        tags,
        params: OpenItemParams,
        body: StartThemesRun,
        response: { 202: ThemesRunStarted },
      },
    },
    async (request, res) =>
      send(
        res,
        await themeCommands.start(
          request.account,
          request.params.studyId,
          request.params.itemId,
          request.body.onlyNew,
        ),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/open-items/:itemId/move',
    {
      ...secured,
      schema: { operationId: 'moveOpenAnswer', tags, params: OpenItemParams, body: MoveOpenAnswer },
    },
    async (request, res) =>
      send(
        res,
        await themeCommands.move(request.account, {
          studyId: request.params.studyId,
          itemId: request.params.itemId,
          responseId: request.body.responseId,
          to: request.body.to,
        }),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/survey-themes/:themeId/decide',
    {
      ...secured,
      schema: {
        operationId: 'decideSurveyTheme',
        tags,
        params: SurveyThemeParams,
        body: DecideSurveyTheme,
      },
    },
    async (request, res) =>
      send(
        res,
        await themeCommands.decide(
          request.account,
          request.params.studyId,
          request.params.themeId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/survey-themes/:themeId/merge',
    {
      ...secured,
      schema: {
        operationId: 'mergeSurveyThemes',
        tags,
        params: SurveyThemeParams,
        body: MergeSurveyThemes,
      },
    },
    async (request, res) =>
      send(
        res,
        await themeCommands.merge(
          request.account,
          request.params.studyId,
          request.params.themeId,
          request.body,
        ),
        () => res.status(204).send(),
      ),
  )

  // Spec 029: the figures of the counted responses, with an optional cross.
  api.get(
    '/api/studies/:studyId/survey-analysis',
    {
      ...secured,
      schema: {
        operationId: 'getSurveyAnalysis',
        tags,
        params: StudyParams,
        querystring: SurveyAnalysisQuery,
        response: { 200: SurveyAnalysis },
      },
    },
    async (request, res) =>
      send(
        res,
        await figures.analysis(
          request.account.id,
          request.params.studyId,
          request.query.crossBy ?? null,
        ),
        (v) => res.send(v as never),
      ),
  )

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
