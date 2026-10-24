import {
  AccessHistoryEntry,
  ChangeRole,
  Created,
  CreateTeam,
  DeleteAccount,
  Me,
  Member,
  MemberParams,
  MemberTeamParams,
  RenameTeam,
  TeamDetail,
  TeamParams,
  UpdateLanguage,
  VersionAck,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { AccountCommands } from '../application/commands/account-commands.ts'
import type { makeCreateTeam } from '../application/commands/create-team.ts'
import type { makeDeleteTeam } from '../application/commands/delete-team.ts'
import type { makeRenameTeam } from '../application/commands/rename-team.ts'
import type { makeSetLanguage } from '../application/commands/set-language.ts'
import type { makeGetMe } from '../application/queries/get-me.ts'
import type { MemberQueries } from '../application/queries/member-queries.ts'

export type WorkspaceHandlers = {
  readonly createTeam: ReturnType<typeof makeCreateTeam>
  readonly renameTeam: ReturnType<typeof makeRenameTeam>
  readonly deleteTeam: ReturnType<typeof makeDeleteTeam>
  readonly setLanguage: ReturnType<typeof makeSetLanguage>
  readonly accounts: AccountCommands
  readonly getMe: ReturnType<typeof makeGetMe>
  readonly queries: MemberQueries
}

export const registerWorkspaceRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: WorkspaceHandlers },
): void => {
  const h = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const noContent = (res: Parameters<typeof reply>[0]) => () => res.status(204).send()

  // Me
  api.get(
    '/api/me',
    { ...secured, schema: { operationId: 'getMe', tags: ['me'], response: { 200: Me } } },
    async (request, res) => {
      const me = await h.getMe(request.account.id)
      return me ?? sendError(res, 'UNAUTHENTICATED')
    },
  )

  api.put(
    '/api/me/language',
    { ...secured, schema: { operationId: 'setLanguage', tags: ['me'], body: UpdateLanguage } },
    async (request, res) =>
      reply(
        res,
        await h.setLanguage({ actor: request.account, language: request.body.language }),
        noContent(res),
      ),
  )

  // Teams
  api.get(
    '/api/teams',
    {
      ...secured,
      schema: { operationId: 'listTeams', tags: ['teams'], response: { 200: z.array(TeamDetail) } },
    },
    async (request) => h.queries.listTeams(request.account),
  )

  api.post(
    '/api/teams',
    {
      ...secured,
      schema: {
        operationId: 'createTeam',
        tags: ['teams'],
        body: CreateTeam,
        response: { 201: Created },
      },
    },
    async (request, res) =>
      reply(res, await h.createTeam({ actor: request.account, name: request.body.name }), (v) =>
        res.status(201).send(v),
      ),
  )

  api.put(
    '/api/teams/:teamId/name',
    {
      ...secured,
      schema: {
        operationId: 'renameTeam',
        tags: ['teams'],
        params: TeamParams,
        body: RenameTeam,
        response: { 200: VersionAck },
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.renameTeam({
          actor: request.account,
          teamId: request.params.teamId,
          ...request.body,
        }),
        (v) => res.send(v),
      ),
  )

  api.delete(
    '/api/teams/:teamId',
    { ...secured, schema: { operationId: 'deleteTeam', tags: ['teams'], params: TeamParams } },
    async (request, res) =>
      reply(
        res,
        await h.deleteTeam({ actor: request.account, teamId: request.params.teamId }),
        noContent(res),
      ),
  )

  // Members (admin only: members get 404 everywhere, as if the area did not exist)
  const adminOnly = { ...secured, schema: { tags: ['members'] } }

  api.get(
    '/api/members',
    {
      ...secured,
      schema: { operationId: 'listMembers', tags: ['members'], response: { 200: z.array(Member) } },
    },
    async (request, res) =>
      request.account.role === 'admin'
        ? h.queries.listMembers()
        : sendError(res, 'MEMBER_NOT_FOUND'),
  )

  api.get(
    '/api/members/:memberId/access-history',
    {
      ...secured,
      schema: {
        operationId: 'getAccessHistory',
        tags: ['members'],
        params: MemberParams,
        response: { 200: z.array(AccessHistoryEntry) },
      },
    },
    async (request, res) => {
      const history =
        request.account.role === 'admin'
          ? await h.queries.getAccessHistory(request.params.memberId)
          : null
      return history ?? sendError(res, 'MEMBER_NOT_FOUND')
    },
  )

  api.put(
    '/api/members/:memberId/teams/:teamId',
    {
      ...adminOnly,
      schema: { operationId: 'grantTeamAccess', ...adminOnly.schema, params: MemberTeamParams },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.grantTeamAccess({
          actor: request.account,
          accountId: request.params.memberId,
          teamId: request.params.teamId,
        }),
        noContent(res),
      ),
  )

  api.delete(
    '/api/members/:memberId/teams/:teamId',
    {
      ...adminOnly,
      schema: { operationId: 'removeTeamAccess', ...adminOnly.schema, params: MemberTeamParams },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.removeTeamAccess({
          actor: request.account,
          accountId: request.params.memberId,
          teamId: request.params.teamId,
        }),
        noContent(res),
      ),
  )

  api.put(
    '/api/members/:memberId/role',
    {
      ...adminOnly,
      schema: {
        operationId: 'changeRole',
        ...adminOnly.schema,
        params: MemberParams,
        body: ChangeRole,
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.changeRole({
          actor: request.account,
          accountId: request.params.memberId,
          role: request.body.role,
        }),
        noContent(res),
      ),
  )

  api.post(
    '/api/members/:memberId/deactivation',
    {
      ...adminOnly,
      schema: { operationId: 'deactivateMember', ...adminOnly.schema, params: MemberParams },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.deactivateAccount({
          actor: request.account,
          accountId: request.params.memberId,
        }),
        noContent(res),
      ),
  )

  api.delete(
    '/api/members/:memberId/deactivation',
    {
      ...adminOnly,
      schema: { operationId: 'reactivateMember', ...adminOnly.schema, params: MemberParams },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.reactivateAccount({
          actor: request.account,
          accountId: request.params.memberId,
        }),
        noContent(res),
      ),
  )

  api.delete(
    '/api/members/:memberId',
    {
      ...adminOnly,
      schema: {
        operationId: 'deleteMember',
        ...adminOnly.schema,
        params: MemberParams,
        body: DeleteAccount,
      },
    },
    async (request, res) =>
      reply(
        res,
        await h.accounts.deleteAccount({
          actor: request.account,
          accountId: request.params.memberId,
          confirmation: request.body.confirmation,
        }),
        noContent(res),
      ),
  )
}
