import {
  Created,
  CreateProject,
  CreateStudy,
  ListProjectsQuery,
  MoveProject,
  ProjectDetail,
  ProjectParams,
  ProjectSummary,
  RenameProject,
  RenameStudy,
  StudyDetail,
  StudyParams,
  StudySummary,
  UpdateProjectGoal,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { makeCreateProject } from '../application/commands/create-project.ts'
import type { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import type { makeRenameProject } from '../application/commands/rename-project.ts'
import type { StudyCommands } from '../application/commands/study-commands.ts'
import type { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { ProjectQueries } from '../application/queries/project-queries.ts'
import type { StudyQueries } from '../application/queries/study-queries.ts'

export type ResearchHandlers = {
  readonly createProject: ReturnType<typeof makeCreateProject>
  readonly renameProject: ReturnType<typeof makeRenameProject>
  readonly updateProjectGoal: ReturnType<typeof makeUpdateProjectGoal>
  readonly moveProjectToTeam: ReturnType<typeof makeMoveProjectToTeam>
  readonly queries: ProjectQueries
  readonly studies: StudyCommands
  readonly studyQueries: StudyQueries
}

export const registerResearchRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: ResearchHandlers },
): void => {
  const h = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['projects']

  api.get(
    '/api/projects',
    {
      ...secured,
      schema: {
        operationId: 'listProjects',
        tags,
        querystring: ListProjectsQuery,
        response: { 200: z.array(ProjectSummary) },
      },
    },
    async (request) => h.queries.listProjects(request.account.id, { team: request.query.team }),
  )

  api.post(
    '/api/projects',
    {
      ...secured,
      schema: {
        operationId: 'createProject',
        tags,
        body: CreateProject,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(res, await h.createProject({ actor: request.account, ...request.body }), (v) =>
        res.status(201).send(v),
      ),
  )

  api.get(
    '/api/projects/:projectId',
    {
      ...secured,
      schema: {
        operationId: 'getProject',
        tags,
        params: ProjectParams,
        response: { 200: ProjectDetail },
      },
    },
    async (request, res) =>
      (await h.queries.getProject(request.account.id, request.params.projectId)) ??
      sendError(res, 'PROJECT_NOT_FOUND'),
  )

  api.put(
    '/api/projects/:projectId/name',
    {
      ...secured,
      schema: {
        operationId: 'renameProject',
        tags,
        params: ProjectParams,
        body: RenameProject,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.renameProject({
          actor: request.account,
          projectId: request.params.projectId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/projects/:projectId/goal',
    {
      ...secured,
      schema: {
        operationId: 'updateProjectGoal',
        tags,
        params: ProjectParams,
        body: UpdateProjectGoal,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.updateProjectGoal({
          actor: request.account,
          projectId: request.params.projectId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/projects/:projectId/team',
    {
      ...secured,
      schema: {
        operationId: 'moveProject',
        tags,
        params: ProjectParams,
        body: MoveProject,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.moveProjectToTeam({
          actor: request.account,
          projectId: request.params.projectId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  // Studies (spec 002)
  const studyTags = ['studies']

  api.get(
    '/api/projects/:projectId/studies',
    {
      ...secured,
      schema: {
        operationId: 'listStudies',
        tags: studyTags,
        params: ProjectParams,
        response: { 200: z.array(StudySummary) },
      },
    },
    async (request, res) =>
      (await h.studyQueries.listStudies(request.account.id, request.params.projectId)) ??
      sendError(res, 'PROJECT_NOT_FOUND'),
  )

  api.post(
    '/api/projects/:projectId/studies',
    {
      ...secured,
      schema: {
        operationId: 'createStudy',
        tags: studyTags,
        params: ProjectParams,
        body: CreateStudy,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.studies.createStudy({
          actor: request.account,
          projectId: request.params.projectId,
          ...request.body,
        }),
        (v) => res.status(201).send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId',
    {
      ...secured,
      schema: {
        operationId: 'getStudy',
        tags: studyTags,
        params: StudyParams,
        response: { 200: StudyDetail },
      },
    },
    async (request, res) =>
      (await h.studyQueries.getStudy(request.account.id, request.params.studyId)) ??
      sendError(res, 'STUDY_NOT_FOUND'),
  )

  api.put(
    '/api/studies/:studyId/name',
    {
      ...secured,
      schema: {
        operationId: 'renameStudy',
        tags: studyTags,
        params: StudyParams,
        body: RenameStudy,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.studies.renameStudy({
          actor: request.account,
          studyId: request.params.studyId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  api.delete(
    '/api/studies/:studyId',
    { ...secured, schema: { operationId: 'deleteStudy', tags: studyTags, params: StudyParams } },
    async (request, res) =>
      reply(
        res,
        await h.studies.deleteStudy({ actor: request.account, studyId: request.params.studyId }),
        () => res.status(204).send(),
      ),
  )
}
