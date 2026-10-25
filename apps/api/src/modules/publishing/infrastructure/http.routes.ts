import {
  DecideDriveChanges,
  DecisionResult,
  DriveChange,
  ERROR_CODES,
  type ErrorCode,
  Publication,
  PublicationParams,
  PublishPreparation,
  StudyParams,
  UpdatePublication,
} from '@goodresearch/contracts'
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import type { PublicationCommands } from '../application/commands/publication-commands.ts'
import type {
  PublicationQueries,
  PublicationView,
} from '../application/queries/publication-queries.ts'

export type PublishingHandlers = {
  readonly commands: PublicationCommands
  readonly queries: PublicationQueries
}

/** Error codes of other modules come as strings: only known codes reach the client. */
const code = (error: string): ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(error) ? (error as ErrorCode) : 'INTERNAL'

const send = <T>(
  res: FastifyReply,
  result: { ok: true; value: T } | { ok: false; error: string },
  onOk: (value: T) => FastifyReply,
): FastifyReply => (result.ok ? onOk(result.value) : sendError(res, code(result.error)))

/** How long the list waits for the checks made when the tab opens. */
const CHECK_WAIT_MS = 3000

const noAccess = (v: PublicationView) => ({ ...v, access: null })

export const registerPublishingRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: PublishingHandlers },
): void => {
  const { commands, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['publishing']

  api.get(
    '/api/studies/:studyId/publications',
    {
      ...secured,
      schema: {
        operationId: 'listPublications',
        tags,
        params: StudyParams,
        response: { 200: z.array(Publication) },
      },
    },
    async (request, res) => {
      // When the tab opens: files not checked in the last minutes are checked (research R9).
      // Bounded: a slow Drive never holds the list; the check goes on and shows next time.
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        // Never an unhandled rejection: the check may end after the answer was sent.
        commands
          .checkStale({ actor: request.account, studyId: request.params.studyId })
          .catch((error: unknown) => request.log.warn({ err: error }, 'publication check failed')),
        new Promise((resolve) => {
          timer = setTimeout(resolve, CHECK_WAIT_MS)
        }),
      ])
      clearTimeout(timer)
      return send(res, await queries.list(request.account, request.params.studyId), (v) =>
        res.send(v.map(noAccess)),
      )
    },
  )

  api.post(
    '/api/studies/:studyId/publications',
    {
      ...secured,
      schema: {
        operationId: 'publishPreparation',
        tags,
        params: StudyParams,
        body: PublishPreparation,
        response: { 201: z.array(Publication) },
      },
    },
    async (request, res) => {
      const done = await commands.publish({
        actor: request.account,
        studyId: request.params.studyId,
        ...request.body,
      })
      if (!done.ok) return sendError(res, code(done.error))
      const list = await queries.list(request.account, request.params.studyId)
      return send(res, list, (v) => res.status(201).send(v.map(noAccess)))
    },
  )

  api.post(
    '/api/publications/:publicationId/check',
    {
      ...secured,
      schema: {
        operationId: 'checkPublication',
        tags,
        params: PublicationParams,
        response: { 200: Publication },
      },
    },
    async (request, res) => {
      const done = await commands.check({
        actor: request.account,
        publicationId: request.params.publicationId,
      })
      if (!done.ok) return sendError(res, code(done.error))
      const v = await queries.view(done.value.publication)
      return res.send({ ...v, access: { canEdit: done.value.canEdit, owner: done.value.owner } })
    },
  )

  api.get(
    '/api/publications/:publicationId/changes',
    {
      ...secured,
      schema: {
        operationId: 'listDriveChanges',
        tags,
        params: PublicationParams,
        response: { 200: z.array(DriveChange) },
      },
    },
    async (request, res) =>
      send(res, await queries.changes(request.account, request.params.publicationId), (v) =>
        res.send(
          v.map((c) => ({
            id: c.id,
            key: c.key,
            kind: c.kind,
            base: c.base ?? null,
            app: c.app ?? null,
            drive: c.drive ?? null,
            decision: c.decision,
          })),
        ),
      ),
  )

  api.post(
    '/api/publications/:publicationId/decisions',
    {
      ...secured,
      schema: {
        operationId: 'decideDriveChanges',
        tags,
        params: PublicationParams,
        body: DecideDriveChanges,
        response: { 200: DecisionResult },
      },
    },
    async (request, res) =>
      send(
        res,
        await commands.decide({
          actor: request.account,
          publicationId: request.params.publicationId,
          decisions: request.body.decisions,
        }),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/publications/:publicationId/update',
    {
      ...secured,
      schema: {
        operationId: 'updatePublication',
        tags,
        params: PublicationParams,
        body: UpdatePublication,
        response: { 200: Publication },
      },
    },
    async (request, res) => {
      const done = await commands.update({
        actor: request.account,
        publicationId: request.params.publicationId,
        replaceDriveChanges: request.body.replaceDriveChanges,
      })
      if (!done.ok) return sendError(res, code(done.error))
      return res.send(noAccess(await queries.view(done.value)))
    },
  )

  api.delete(
    '/api/publications/:publicationId',
    {
      ...secured,
      schema: { operationId: 'forgetPublication', tags, params: PublicationParams },
    },
    async (request, res) =>
      send(
        res,
        await commands.forget({
          actor: request.account,
          publicationId: request.params.publicationId,
        }),
        () => res.status(204).send(),
      ),
  )
}
