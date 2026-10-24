import {
  Created,
  CreateProject,
  ListProjectsQuery,
  MoveProject,
  ProjectDetail,
  ProjectParams,
  ProjectSummary,
  RenameProject,
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
import type { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { ProjectQueries } from '../application/queries/project-queries.ts'

export type ResearchHandlers = {
  readonly createProject: ReturnType<typeof makeCreateProject>
  readonly renameProject: ReturnType<typeof makeRenameProject>
  readonly updateProjectGoal: ReturnType<typeof makeUpdateProjectGoal>
  readonly moveProjectToTeam: ReturnType<typeof makeMoveProjectToTeam>
  readonly queries: ProjectQueries
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
}
