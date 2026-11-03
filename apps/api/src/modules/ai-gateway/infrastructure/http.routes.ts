import {
  AiProviderPage,
  AiProviderView,
  CallbackQuery,
  ConnectApiKey,
  GrantCheck,
  ProviderTestResult,
  ReconnectStart,
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

/** Spec 030: the pop-up landing page tells the page that opened it, then closes. */
const donePath = (result: string, cost: number | null | undefined) =>
  `/google/done?connection=vertex&result=${result}${typeof cost === 'number' ? `&cost=${cost}` : ''}`

/**
 * Where a reconnection ends: the pop-up page, the setup form, or back where the person was. The
 * cost of the reconnection's real call goes along, to be shown where it was asked (AGENTS.md).
 */
const reconnectEnd = (
  back: { returnTo: string; popup: boolean },
  result: string,
  cost?: number | null,
) => {
  if (back.popup) return donePath(result, cost)
  const page =
    result === 'checks-failed' || result === 'other-account'
      ? withQuery(`${SETUP_PATH}?provider=vertex`, 'google', result)
      : withQuery(back.returnTo, 'google', result)
  return typeof cost === 'number' ? withQuery(page, 'googleCost', String(cost)) : page
}

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
      if (error || !state || !code) {
        const back = state
          ? await commands.abandonGoogleGrant({ actor: request.account, state })
          : null
        return res.redirect(
          back?.ok && back.value.mode === 'reconnect'
            ? reconnectEnd(back.value, error === 'access_denied' ? 'cancelled' : 'error')
            : withQuery(SETUP_PATH, 'google', 'error'),
        )
      }
      try {
        const done = await commands.completeGoogleGrant({ actor: request.account, state, code })
        if (!done.ok) return res.redirect(withQuery(SETUP_PATH, 'google', 'error'))
        return res.redirect(
          done.value.mode === 'reconnect'
            ? reconnectEnd(done.value, done.value.result ?? 'error', done.value.cost)
            : withQuery(done.value.returnTo, 'google', 'granted'),
        )
      } catch (failure) {
        request.log.warn({ err: failure }, 'Google Cloud consent failed')
        return res.redirect(withQuery(SETUP_PATH, 'google', 'error'))
      }
    },
  )

  api.post(
    '/api/ai-provider/google/reconnect',
    {
      ...secured,
      schema: {
        operationId: 'reconnectAiGoogleGrant',
        tags,
        body: ReconnectStart,
        response: { 200: z.object({ url: z.string() }) },
      },
    },
    async (request, res) =>
      reply(
        res,
        await commands.startGoogleReconnect({
          actor: request.account,
          returnTo: request.body.returnTo,
          popup: request.body.popup,
        }),
        (value) => res.send(value),
      ),
  )

  api.post(
    '/api/ai-provider/grant/check',
    {
      ...secured,
      schema: { operationId: 'checkAiGoogleGrant', tags, response: { 200: GrantCheck } },
    },
    async (request, res) =>
      reply(res, await commands.checkGrant({ actor: request.account }), (value) => res.send(value)),
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
