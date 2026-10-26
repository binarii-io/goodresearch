import {
  AnalysisEstimate,
  AnalysisRunStarted,
  AnalyzeSession,
  AttachFolder,
  CallbackQuery,
  ConnectQuery,
  DecideProposals,
  DecideSession,
  EditSession,
  EstimateQuery,
  Fieldwork,
  InventoryFile,
  InventoryFilesQuery,
  LinkSession,
  MySource,
  RenameFiles,
  RenamePlan,
  RenameResult,
  RunParams,
  Session,
  SessionParams,
  StartAnalysisRun,
  StudyParams,
  StudySourceView,
} from '@goodresearch/contracts'
import { withQuery } from '@goodresearch/shared'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { AnalysisCommands } from '../application/commands/analysis-commands.ts'
import type { RenameCommands } from '../application/commands/rename-commands.ts'
import type { SessionCommands } from '../application/commands/session-commands.ts'
import type { SourceCommands } from '../application/commands/source-commands.ts'
import type { SessionQueries } from '../application/queries/session-queries.ts'
import type { SourceQueries } from '../application/queries/source-queries.ts'
import type { DevDrive } from './dev-drive.ts'

export type IngestionHandlers = {
  readonly commands: SourceCommands
  readonly queries: SourceQueries
  readonly sessions: SessionCommands
  readonly sessionQueries: SessionQueries
  readonly analysis: AnalysisCommands
  readonly rename: RenameCommands
  /** Simulated Drive only (`DRIVE_FAKE`): what a person does in Drive, for end-to-end tests. */
  readonly devEdit?: DevDrive['edit']
}

const DevEdit = z.object({
  replace: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  cells: z
    .array(z.object({ row: z.string(), key: z.string(), value: z.string().nullable() }))
    .optional(),
})

export const registerIngestionRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: IngestionHandlers },
): void => {
  const { commands, queries, sessions, sessionQueries, analysis, rename, devEdit } = deps.handlers
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

  // Spec 008: the interviews found in the folder (Fieldwork).
  const fieldworkTags = ['fieldwork']
  /** After a command, the session as the person now sees it. */
  const sendSession =
    (
      request: { account: { id: string; role: 'admin' | 'member' } },
      res: Parameters<typeof reply>[0],
    ) =>
    async (done: { id: string }) =>
      reply(res, await sessionQueries.session(request.account, done.id), (view) => res.send(view))

  api.get(
    '/api/studies/:studyId/sessions',
    {
      ...secured,
      schema: {
        operationId: 'getFieldwork',
        tags: fieldworkTags,
        params: StudyParams,
        response: { 200: Fieldwork },
      },
    },
    async (request, res) =>
      reply(res, await sessionQueries.fieldwork(request.account, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.post(
    '/api/sessions/:sessionId/link',
    {
      ...secured,
      schema: {
        operationId: 'linkSession',
        tags: fieldworkTags,
        params: SessionParams,
        body: LinkSession,
        response: { 200: Session },
      },
    },
    async (request, res) => {
      const done = await sessions.link({
        actor: request.account,
        sessionId: request.params.sessionId,
        ...request.body,
      })
      return done.ok ? sendSession(request, res)(done.value) : reply(res, done, () => res)
    },
  )

  api.patch(
    '/api/sessions/:sessionId',
    {
      ...secured,
      schema: {
        operationId: 'editSession',
        tags: fieldworkTags,
        params: SessionParams,
        body: EditSession,
        response: { 200: Session },
      },
    },
    async (request, res) => {
      const done = await sessions.edit({
        actor: request.account,
        sessionId: request.params.sessionId,
        ...request.body,
      })
      return done.ok ? sendSession(request, res)(done.value) : reply(res, done, () => res)
    },
  )

  api.post(
    '/api/sessions/:sessionId/decision',
    {
      ...secured,
      schema: {
        operationId: 'decideSession',
        tags: fieldworkTags,
        params: SessionParams,
        body: DecideSession,
        response: { 200: Session },
      },
    },
    async (request, res) => {
      const done = await sessions.decide({
        actor: request.account,
        sessionId: request.params.sessionId,
        ...request.body,
      })
      return done.ok ? sendSession(request, res)(done.value) : reply(res, done, () => res)
    },
  )

  // Spec 009: analyzing the interviews.
  api.post(
    '/api/sessions/:sessionId/analysis',
    {
      ...secured,
      schema: {
        operationId: 'analyzeSession',
        tags: fieldworkTags,
        params: SessionParams,
        body: AnalyzeSession,
        response: { 200: Session },
      },
    },
    async (request, res) => {
      const done = await analysis.analyzeSession({
        actor: request.account,
        sessionId: request.params.sessionId,
        consent: request.body.consent === true,
      })
      return done.ok ? sendSession(request, res)(done.value) : reply(res, done, () => res)
    },
  )

  api.post(
    '/api/sessions/:sessionId/proposals',
    {
      ...secured,
      schema: {
        operationId: 'decideProposals',
        tags: fieldworkTags,
        params: SessionParams,
        body: DecideProposals,
        response: { 200: Session },
      },
    },
    async (request, res) => {
      const done = await analysis.decide({
        actor: request.account,
        sessionId: request.params.sessionId,
        version: request.body.version,
        decisions: request.body.decisions.map((d) => ({
          field: d.field,
          fileId: d.fileId,
          action: d.action,
          value: d.people ?? d.text,
        })),
      })
      return done.ok ? sendSession(request, res)(done.value) : reply(res, done, () => res)
    },
  )

  api.get(
    '/api/studies/:studyId/analysis-runs/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateAnalysisRun',
        tags: fieldworkTags,
        params: StudyParams,
        querystring: EstimateQuery,
        response: { 200: AnalysisEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await analysis.estimate(request.account, request.params.studyId, {
          all: request.query.all === 'true',
        }),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/analysis-runs',
    {
      ...secured,
      schema: {
        operationId: 'startAnalysisRun',
        tags: fieldworkTags,
        params: StudyParams,
        body: StartAnalysisRun,
        response: { 202: AnalysisRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await analysis.startRun({
          actor: request.account,
          studyId: request.params.studyId,
          consent: request.body.consent === true,
          all: request.body.all === true,
        }),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/analysis-runs/:runId/stop',
    {
      ...secured,
      schema: { operationId: 'stopAnalysisRun', tags: fieldworkTags, params: RunParams },
    },
    async (request, res) =>
      reply(res, await analysis.stopRun({ actor: request.account, ...request.params }), () =>
        res.status(204).send(),
      ),
  )

  api.get(
    '/api/sessions/:sessionId/rename',
    {
      ...secured,
      schema: {
        operationId: 'getRenamePlan',
        tags: fieldworkTags,
        params: SessionParams,
        response: { 200: RenamePlan },
      },
    },
    async (request, res) =>
      reply(res, await rename.renamePlan(request.account, request.params.sessionId), (v) =>
        res.send(v),
      ),
  )

  api.post(
    '/api/sessions/:sessionId/rename',
    {
      ...secured,
      schema: {
        operationId: 'renameSessionFiles',
        tags: fieldworkTags,
        params: SessionParams,
        body: RenameFiles,
        response: { 200: RenameResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await rename.renameFiles(request.account, request.params.sessionId, request.body.fileIds),
        (v) => res.send(v),
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

  if (devEdit)
    api.post(
      '/api/dev/drive-documents/:fileId/edit',
      {
        ...secured,
        schema: { hide: true, params: z.object({ fileId: z.string().max(200) }), body: DevEdit },
      },
      async (request, res) =>
        devEdit(request.params.fileId, request.body)
          ? res.status(204).send()
          : sendError(res, 'NOT_FOUND'),
    )

  // Browser navigations (not called by the API client): consent start and Google's redirect back.
  api.get(
    '/api/sources/google-drive/connect',
    { ...secured, schema: { hide: true, querystring: ConnectQuery } },
    async (request, res) => {
      const started = await commands.startDriveConnection({
        actor: request.account,
        returnTo: request.query.returnTo,
        access: request.query.access,
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
