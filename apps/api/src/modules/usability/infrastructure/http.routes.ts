import { Readable } from 'node:stream'
import {
  AddObservation,
  CorrectTaskResult,
  DecideObservation,
  ERROR_CODES,
  type ErrorCode,
  ObservationParams,
  StartUsabilityRun,
  StudyParams,
  TaskResultParams,
  UsabilityObservation,
  UsabilityResults,
  UsabilityRunParams,
  UsabilityRunStarted,
  UsabilitySessionParams,
  UsabilitySessionReview,
  UsabilityStudyAnalysis,
  UsabilityTaskResult,
} from '@goodresearch/contracts'
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import type { AnalysisRunCommands } from '../application/commands/analysis-run.ts'
import type { ObservationCommands } from '../application/commands/observation-commands.ts'
import type { UsabilityDeps } from '../application/ports.ts'
import type { AnalysisQueries } from '../application/queries/analysis-queries.ts'
import type { Observation } from '../domain/observation.ts'
import type { TaskResult } from '../domain/task-result.ts'

export type UsabilityHandlers = {
  readonly run: AnalysisRunCommands
  readonly observations: ObservationCommands
  readonly queries: AnalysisQueries
  readonly deps: UsabilityDeps
}

const code = (error: string): ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(error) ? (error as ErrorCode) : 'INTERNAL'

const send = <T>(
  res: FastifyReply,
  result: { ok: true; value: T } | { ok: false; error: string },
  onOk: (value: T) => FastifyReply,
): FastifyReply => (result.ok ? onOk(result.value) : sendError(res, code(result.error)))

export const observationView = (o: Observation) => ({
  id: o.id,
  taskId: o.taskId,
  kind: o.kind,
  momentMs: o.momentMs,
  text: o.text,
  quote: o.quote,
  seen: o.seen,
  susItem: o.susItem,
  susValue: o.susValue,
  screenshot: o.screenshotKey !== null,
  judge: o.judge,
  judgeReason: o.judgeReason,
  arbiter: o.arbiter,
  arbiterReason: o.arbiterReason,
  origin: o.origin,
  status: o.status,
  decidedAt: o.decidedAt?.toISOString() ?? null,
  version: o.version,
})

const taskView = (r: TaskResult) => ({
  id: r.id,
  outcome: r.outcome,
  startMs: r.startMs,
  endMs: r.endMs,
  timeOnTaskMs: r.timeOnTaskMs,
  path: r.path,
  ease: r.ease,
  status: r.status,
  version: r.version,
})

/** Spec 038: reserved to the owning team with the folder open (spec 026), as the Fieldwork. */
export const registerUsabilityRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: UsabilityHandlers },
): void => {
  const { run, observations, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['usability']

  api.get(
    '/api/studies/:studyId/usability/analysis',
    {
      ...secured,
      schema: {
        operationId: 'getUsabilityAnalysis',
        tags,
        params: StudyParams,
        response: { 200: UsabilityStudyAnalysis },
      },
    },
    async (request, res) =>
      send(res, await queries.study(request.account, request.params.studyId), (v) => res.send(v)),
  )

  api.post(
    '/api/studies/:studyId/usability/analysis/runs',
    {
      ...secured,
      schema: {
        operationId: 'startUsabilityRun',
        tags,
        params: StudyParams,
        body: StartUsabilityRun,
        response: { 200: UsabilityRunStarted },
      },
    },
    async (request, res) =>
      send(
        res,
        await run.start({
          actor: request.account,
          studyId: request.params.studyId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/usability/analysis/runs/:runId/stop',
    {
      ...secured,
      schema: {
        operationId: 'stopUsabilityRun',
        tags,
        params: UsabilityRunParams,
        response: { 204: z.null() },
      },
    },
    async (request, res) =>
      send(res, await run.stop(request.account, request.params.studyId, request.params.runId), () =>
        res.status(204).send(null),
      ),
  )

  api.get(
    '/api/studies/:studyId/usability/results',
    {
      ...secured,
      schema: {
        operationId: 'getUsabilityResults',
        tags,
        params: StudyParams,
        response: { 200: UsabilityResults },
      },
    },
    async (request, res) =>
      send(res, await queries.results(request.account, request.params.studyId), (v) => res.send(v)),
  )

  api.get(
    '/api/usability/sessions/:sessionId',
    {
      ...secured,
      schema: {
        operationId: 'getUsabilitySession',
        tags,
        params: UsabilitySessionParams,
        response: { 200: UsabilitySessionReview },
      },
    },
    async (request, res) =>
      send(res, await queries.session(request.account, request.params.sessionId), (v) =>
        res.send({
          ...v,
          tasks: v.tasks.map((t) => ({
            ...t,
            result: t.result ? taskView(t.result) : null,
            observations: t.observations.map(observationView),
          })),
          rejected: v.rejected.map(observationView),
        }),
      ),
  )

  // FR-011: the video plays from Drive with the person's own access; nothing is stored.
  api.get(
    '/api/usability/sessions/:sessionId/video',
    {
      ...secured,
      schema: { operationId: 'getUsabilityVideo', tags, params: UsabilitySessionParams },
    },
    async (request, res) => {
      // Asked at every seek: the session's row only; `range` checks the access and the inventory.
      const video = await deps.handlers.deps.sessions.video(request.params.sessionId)
      if (!video) return sendError(res, 'SESSION_NOT_FOUND')
      const range = await deps.handlers.deps.sessions.range(
        request.account.id,
        video.studyId,
        video.fileId,
        typeof request.headers.range === 'string' ? request.headers.range : null,
      )
      if (range === 'access-lost') return sendError(res, 'FOLDER_ACCESS_REQUIRED')
      if (!range) return sendError(res, 'SESSION_NOT_FOUND')
      res
        .status(range.status)
        .header('content-type', range.contentType)
        .header('accept-ranges', 'bytes')
      if (range.contentLength !== null) res.header('content-length', String(range.contentLength))
      if (range.contentRange) res.header('content-range', range.contentRange)
      res.header('cache-control', 'private, no-store')
      return res.send(Readable.from(range.body))
    },
  )

  api.get(
    '/api/usability/observations/:observationId/screenshot',
    {
      ...secured,
      schema: { operationId: 'getUsabilityScreenshot', tags, params: ObservationParams },
    },
    async (request, res) => {
      const o = await deps.handlers.deps.store.observation(request.params.observationId)
      if (!o?.screenshotKey) return sendError(res, 'SESSION_NOT_FOUND')
      const analysis = await deps.handlers.deps.store.analysisById(o.analysisId)
      if (!analysis) return sendError(res, 'SESSION_NOT_FOUND')
      const access = await deps.handlers.deps.sessions.access(request.account.id, analysis.studyId)
      if (access.kind === 'not-found') return sendError(res, 'SESSION_NOT_FOUND')
      if (access.kind === 'folder-required') return sendError(res, 'FOLDER_ACCESS_REQUIRED')
      const jpeg = await deps.handlers.deps.screens.get(o.screenshotKey)
      if (!jpeg) return sendError(res, 'SESSION_NOT_FOUND')
      return res
        .header('content-type', 'image/jpeg')
        .header('cache-control', 'private, max-age=3600')
        .send(Buffer.from(jpeg))
    },
  )

  api.post(
    '/api/usability/observations/:observationId/decision',
    {
      ...secured,
      schema: {
        operationId: 'decideUsabilityObservation',
        tags,
        params: ObservationParams,
        body: DecideObservation,
        response: { 200: UsabilityObservation },
      },
    },
    async (request, res) => {
      const { version, ...decision } = request.body
      return send(
        res,
        await observations.decide({
          actor: request.account,
          observationId: request.params.observationId,
          decision,
          version,
        }),
        (o) => res.send(observationView(o)),
      )
    },
  )

  api.post(
    '/api/usability/sessions/:sessionId/observations',
    {
      ...secured,
      schema: {
        operationId: 'addUsabilityObservation',
        tags,
        params: UsabilitySessionParams,
        body: AddObservation,
        response: { 200: UsabilityObservation },
      },
    },
    async (request, res) =>
      send(
        res,
        await observations.add({
          actor: request.account,
          sessionId: request.params.sessionId,
          ...request.body,
        }),
        (o) => res.send(observationView(o)),
      ),
  )

  api.put(
    '/api/usability/task-results/:taskResultId',
    {
      ...secured,
      schema: {
        operationId: 'correctUsabilityTaskResult',
        tags,
        params: TaskResultParams,
        body: CorrectTaskResult,
        response: { 200: UsabilityTaskResult },
      },
    },
    async (request, res) =>
      send(
        res,
        await observations.correctTask({
          actor: request.account,
          taskResultId: request.params.taskResultId,
          ...request.body,
        }),
        (r) => res.send(taskView(r)),
      ),
  )
}
