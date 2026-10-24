import {
  AttachFolder,
  CallbackQuery,
  ConnectQuery,
  InventoryFile,
  InventoryFilesQuery,
  MySource,
  StudyParams,
  StudySourceView,
} from '@goodresearch/contracts'
import { withQuery } from '@goodresearch/shared'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { SourceCommands } from '../application/commands/source-commands.ts'
import type { SourceQueries } from '../application/queries/source-queries.ts'

export type IngestionHandlers = {
  readonly commands: SourceCommands
  readonly queries: SourceQueries
}

export const registerIngestionRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: IngestionHandlers },
): void => {
  const { commands, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['sources']
  const accepted = (res: Parameters<typeof reply>[0]) => () => res.status(202).send()

  api.get(
    '/api/studies/:studyId/source',
    {
      ...secured,
      schema: {
        operationId: 'getStudySource',
        tags,
        params: StudyParams,
        response: { 200: StudySourceView },
      },
    },
    async (request, res) =>
      (await queries.studySource(request.account, request.params.studyId)) ??
      sendError(res, 'STUDY_NOT_FOUND'),
  )

  api.put(
    '/api/studies/:studyId/source',
    {
      ...secured,
      schema: { operationId: 'attachFolder', tags, params: StudyParams, body: AttachFolder },
    },
    async (request, res) =>
      reply(
        res,
        await commands.attachFolder({
          actor: request.account,
          studyId: request.params.studyId,
          link: request.body.link,
        }),
        accepted(res),
      ),
  )

  api.delete(
    '/api/studies/:studyId/source',
    { ...secured, schema: { operationId: 'detachFolder', tags, params: StudyParams } },
    async (request, res) =>
      reply(
        res,
        await commands.detachFolder({ actor: request.account, studyId: request.params.studyId }),
        () => res.status(204).send(),
      ),
  )

  api.post(
    '/api/studies/:studyId/source/inventory',
    { ...secured, schema: { operationId: 'refreshInventory', tags, params: StudyParams } },
    async (request, res) =>
      reply(
        res,
        await commands.refreshInventory({
          actor: request.account,
          studyId: request.params.studyId,
        }),
        accepted(res),
      ),
  )

  api.get(
    '/api/studies/:studyId/source/files',
    {
      ...secured,
      schema: {
        operationId: 'listInventoryFiles',
        tags,
        params: StudyParams,
        querystring: InventoryFilesQuery,
        response: { 200: z.array(InventoryFile) },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.listFiles(request.account, request.params.studyId, request.query),
        (files) => res.send(files),
      ),
  )

  api.get(
    '/api/me/sources',
    {
      ...secured,
      schema: { operationId: 'listMySources', tags, response: { 200: z.array(MySource) } },
    },
    async (request) => queries.mySources(request.account),
  )

  api.delete(
    '/api/me/sources/google-drive',
    { ...secured, schema: { operationId: 'disconnectDrive', tags } },
    async (request, res) =>
      reply(res, await commands.disconnectDrive({ actor: request.account }), () =>
        res.status(204).send(),
      ),
  )

  // Browser navigations (not called by the API client): consent start and Google's redirect back.
  api.get(
    '/api/sources/google-drive/connect',
    { ...secured, schema: { hide: true, querystring: ConnectQuery } },
    async (request, res) => {
      const started = await commands.startDriveConnection({
        actor: request.account,
        returnTo: request.query.returnTo,
      })
      return started.ok ? res.redirect(started.value.url) : sendError(res, started.error)
    },
  )

  api.get(
    '/api/sources/google-drive/callback',
    { ...secured, schema: { hide: true, querystring: CallbackQuery } },
    async (request, res) => {
      const { state, code, error } = request.query
      if (error || !state || !code) return res.redirect(withQuery('/', 'drive', 'error'))
      try {
        const done = await commands.completeDriveConnection({ actor: request.account, state, code })
        return res.redirect(
          done.ok
            ? withQuery(done.value.returnTo, 'drive', 'connected')
            : withQuery('/', 'drive', 'error'),
        )
      } catch (failure) {
        request.log.warn({ err: failure }, 'drive consent failed')
        return res.redirect(withQuery('/', 'drive', 'error'))
      }
    },
  )
}
