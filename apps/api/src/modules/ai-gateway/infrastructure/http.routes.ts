import {
  AiProviderPage,
  AiProviderView,
  CallbackQuery,
  ConnectApiKey,
  ProviderTestResult,
  StartGoogleGrant,
  VertexCheckRequest,
  VertexCheckResult,
} from '@goodresearch/contracts'
import { withQuery } from '@goodresearch/shared'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { reply } from '#platform/http/result.ts'
import type { ProviderCommands } from '../application/commands/provider-commands.ts'
import type { ProviderQueries } from '../application/queries/provider-queries.ts'

export type AiHandlers = {
  readonly commands: ProviderCommands
  readonly queries: ProviderQueries
}

/** Where the Google consent comes back when it failed: the provider step. */
const SETUP_PATH = '/setup/ai-provider'

export const registerAiRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: AiHandlers },
): void => {
  const { commands, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['ai-provider']

  api.get(
    '/api/ai-provider',
    {
      ...secured,
      schema: { operationId: 'getAiProvider', tags, response: { 200: AiProviderPage } },
    },
    async (request) => queries.page(request.account.id),
  )

  api.put(
    '/api/ai-provider/api-key',
    {
      ...secured,
      schema: {
        operationId: 'connectAiApiKey',
        tags,
        body: ConnectApiKey,
        response: { 200: AiProviderView },
      },
    },
    async (request, res) =>
      reply(
        res,
        await commands.connectApiKey({
          actor: request.account,
          provider: request.body.provider,
          apiKey: request.body.apiKey,
        }),
        (connection) => res.send(queries.view(connection)),
      ),
  )

  api.post(
    '/api/ai-provider/google/start',
    {
      ...secured,
      schema: {
        operationId: 'startAiGoogleGrant',
        tags,
        body: StartGoogleGrant,
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (request, res) =>
      reply(
        res,
        await commands.startGoogleGrant({
          actor: request.account,
          returnTo: request.body.returnTo,
        }),
        (value) => res.send(value),
      ),
  )

  api.get(
    '/api/ai-provider/google/callback',
    { ...secured, schema: { hide: true, querystring: CallbackQuery } },
    async (request, res) => {
      const { state, code, error } = request.query
      if (error || !state || !code) return res.redirect(withQuery(SETUP_PATH, 'google', 'error'))
      try {
        const done = await commands.completeGoogleGrant({ actor: request.account, state, code })
        return res.redirect(
          done.ok
            ? withQuery(done.value.returnTo, 'google', 'granted')
            : withQuery(SETUP_PATH, 'google', 'error'),
        )
      } catch (failure) {
        request.log.warn({ err: failure }, 'Google Cloud consent failed')
        return res.redirect(withQuery(SETUP_PATH, 'google', 'error'))
      }
    },
  )

  api.post(
    '/api/ai-provider/vertex/check',
    {
      ...secured,
      schema: {
        operationId: 'checkVertexProject',
        tags,
        body: VertexCheckRequest,
        response: { 200: VertexCheckResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await commands.checkVertex({
          actor: request.account,
          project: request.body.project,
          region: request.body.region,
        }),
        ({ checks, connection }) =>
          res.send({
            checks,
            saved: connection !== null,
            connection: connection ? queries.view(connection) : null,
          }),
      ),
  )

  api.post(
    '/api/ai-provider/test',
    {
      ...secured,
      schema: { operationId: 'testAiProvider', tags, response: { 200: ProviderTestResult } },
    },
    async (request, res) =>
      reply(res, await commands.testProvider({ actor: request.account }), (value) =>
        res.send(value),
      ),
  )

  api.delete(
    '/api/ai-provider',
    { ...secured, schema: { operationId: 'removeAiProvider', tags } },
    async (request, res) =>
      reply(res, await commands.removeProvider({ actor: request.account }), () =>
        res.status(204).send(),
      ),
  )
}
