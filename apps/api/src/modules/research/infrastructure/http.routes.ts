import {
  ConfirmWithName,
  Created,
  CreateProject,
  CreateStudy,
  InterviewGuide,
  ListProjectsQuery,
  MoveProject,
  PlannedInterview,
  PlannedInterviewInput,
  PlannedInterviewParams,
  ProjectDetail,
  ProjectParams,
  ProjectSummary,
  RenameProject,
  RenameStudy,
  SaveInterviewGuide,
  StudyDetail,
  StudyParams,
  StudySettings,
  StudySummary,
  TeamStudies,
  TeamStudiesQuery,
  UpdatePlannedInterview,
  UpdateProjectGoal,
  UpdateStudyGoal,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { makeCreateProject } from '../application/commands/create-project.ts'
import type { makeDeleteProject } from '../application/commands/delete-project.ts'
import type { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import type { PreparationCommands } from '../application/commands/preparation-commands.ts'
import type { makeRenameProject } from '../application/commands/rename-project.ts'
import type { StudyCommands } from '../application/commands/study-commands.ts'
import type { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { PreparationQueries } from '../application/queries/preparation-queries.ts'
import type { ProjectQueries } from '../application/queries/project-queries.ts'
import type { StudyQueries } from '../application/queries/study-queries.ts'

export type ResearchHandlers = {
  readonly createProject: ReturnType<typeof makeCreateProject>
  readonly deleteProject: ReturnType<typeof makeDeleteProject>
  readonly renameProject: ReturnType<typeof makeRenameProject>
  readonly updateProjectGoal: ReturnType<typeof makeUpdateProjectGoal>
  readonly moveProjectToTeam: ReturnType<typeof makeMoveProjectToTeam>
  readonly queries: ProjectQueries
  readonly studies: StudyCommands
  readonly studyQueries: StudyQueries
  readonly preparation: PreparationCommands
  readonly preparationQueries: PreparationQueries
}

const fieldsOf = (body: z.infer<typeof PlannedInterviewInput>) => ({
  ...body,
  scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
})

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
    '/api/projects/:projectId/delete',
    {
      ...secured,
      schema: {
        operationId: 'deleteProject',
        tags,
        params: ProjectParams,
        body: ConfirmWithName,
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.deleteProject({
          actor: request.account,
          projectId: request.params.projectId,
          name: request.body.name,
        }),
        () => res.status(204).send(),
      ),
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

  // Spec 019: a study in several projects, or none.
  api.post(
    '/api/projects/:projectId/studies/:studyId/link',
    {
      ...secured,
      schema: {
        operationId: 'attachStudy',
        tags: studyTags,
        params: StudyParams.extend(ProjectParams.shape),
      },
    },
    async (request, res) =>
      reply(res, await h.studies.attachStudy({ actor: request.account, ...request.params }), () =>
        res.status(204).send(),
      ),
  )

  api.delete(
    '/api/projects/:projectId/studies/:studyId/link',
    {
      ...secured,
      schema: {
        operationId: 'detachStudy',
        tags: studyTags,
        params: StudyParams.extend(ProjectParams.shape),
      },
    },
    async (request, res) =>
      reply(res, await h.studies.detachStudy({ actor: request.account, ...request.params }), () =>
        res.status(204).send(),
      ),
  )

  api.get(
    '/api/teams/:teamId/studies',
    {
      ...secured,
      schema: {
        operationId: 'listTeamStudies',
        tags: studyTags,
        params: z.object({ teamId: z.string() }),
        querystring: TeamStudiesQuery,
        response: { 200: TeamStudies },
      },
    },
    async (request, res) =>
      (await h.studyQueries.listTeamStudies(
        request.account.id,
        request.params.teamId,
        request.query,
      )) ?? sendError(res, 'TEAM_NOT_FOUND'),
  )

  api.put(
    '/api/studies/:studyId/goal',
    {
      ...secured,
      schema: {
        operationId: 'updateStudyGoal',
        tags: studyTags,
        params: StudyParams,
        body: UpdateStudyGoal,
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.studies.updateStudyGoal({
          actor: request.account,
          studyId: request.params.studyId,
          ...request.body,
        }),
        (value) => res.send(value),
      ),
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

  api.patch(
    '/api/studies/:studyId/settings',
    {
      ...secured,
      schema: {
        operationId: 'updateStudySettings',
        tags: studyTags,
        params: StudyParams,
        body: StudySettings,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.studies.setAnonymisation({
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

  // Preparation (spec 006)
  const prepTags = ['preparation']

  api.get(
    '/api/studies/:studyId/guide',
    {
      ...secured,
      schema: {
        operationId: 'getInterviewGuide',
        tags: prepTags,
        params: StudyParams,
        response: { 200: InterviewGuide.nullable() },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.preparationQueries.getGuide(request.account.id, request.params.studyId),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/studies/:studyId/guide',
    {
      ...secured,
      schema: {
        operationId: 'saveInterviewGuide',
        tags: prepTags,
        params: StudyParams,
        body: SaveInterviewGuide,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.preparation.saveGuide({
          actor: request.account,
          studyId: request.params.studyId,
          content: request.body.content,
          version: request.body.version,
          origin: 'person',
        }),
        (v) => res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/planned-interviews',
    {
      ...secured,
      schema: {
        operationId: 'listPlannedInterviews',
        tags: prepTags,
        params: StudyParams,
        response: { 200: z.array(PlannedInterview) },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.preparationQueries.listPlannedInterviews(
          request.account.id,
          request.params.studyId,
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/planned-interviews',
    {
      ...secured,
      schema: {
        operationId: 'addPlannedInterview',
        tags: prepTags,
        params: StudyParams,
        body: PlannedInterviewInput,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.preparation.addPlannedInterview({
          actor: request.account,
          studyId: request.params.studyId,
          fields: fieldsOf(request.body),
        }),
        (v) => res.status(201).send(v),
      ),
  )

  api.put(
    '/api/planned-interviews/:plannedInterviewId',
    {
      ...secured,
      schema: {
        operationId: 'updatePlannedInterview',
        tags: prepTags,
        params: PlannedInterviewParams,
        body: UpdatePlannedInterview,
        response: { 200: VersionAck },
      },
    },
    async (request, res) => {
      const { version, ...fields } = request.body
      return reply(
        res,
        await h.preparation.updatePlannedInterview({
          actor: request.account,
          plannedInterviewId: request.params.plannedInterviewId,
          fields: fieldsOf(fields),
          version,
        }),
        (v) => res.send(v),
      )
    },
  )

  api.delete(
    '/api/planned-interviews/:plannedInterviewId',
    {
      ...secured,
      schema: {
        operationId: 'deletePlannedInterview',
        tags: prepTags,
        params: PlannedInterviewParams,
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.preparation.deletePlannedInterview({
          actor: request.account,
          plannedInterviewId: request.params.plannedInterviewId,
        }),
        () => res.status(204).send(),
      ),
  )
}
