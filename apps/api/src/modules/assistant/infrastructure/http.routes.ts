import {
  ContinueAssistantConversation,
  ConversationDetail,
  ConversationParams,
  ConversationSummary,
  Proposal,
  ProposalParams,
  RenameConversation,
  SendAssistantMessage,
} from '@goodresearch/contracts'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { sendError } from '#platform/http/errors.ts'
import { reply } from '#platform/http/result.ts'
import type { ConversationCommands } from '../application/commands/conversation-commands.ts'
import type { ProposalCommands } from '../application/commands/proposal-commands.ts'
import type { SendMessage, StreamEvent } from '../application/commands/send-message.ts'
import type { ConversationQueries } from '../application/queries/conversation-queries.ts'

export type AssistantHandlers = {
  readonly conversations: ConversationCommands
  readonly send: SendMessage
  readonly proposals: ProposalCommands
  readonly queries: ConversationQueries
}

/** Writes an answer as server-sent events; closing the request stops it. */
const streamAnswer = async (
  request: FastifyRequest,
  res: FastifyReply,
  events: AsyncGenerator<StreamEvent>,
): Promise<void> => {
  res.hijack()
  const raw = res.raw
  raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })
  let closed = false
  raw.on('close', () => {
    closed = true
  })
  try {
    for await (const event of events) {
      if (closed) break
      raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  } catch (error) {
    request.log.error({ err: error }, 'assistant stream failed')
  } finally {
    // Ends the answer (stopped) when the browser went away before the end.
    await events.return(undefined)
    raw.end()
  }
}

export const registerAssistantRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: AssistantHandlers },
): void => {
  const { conversations, send, proposals, queries } = deps.handlers
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['assistant']

  api.get(
    '/api/assistant/conversations',
    {
      ...secured,
      schema: {
        operationId: 'listConversations',
        tags,
        response: { 200: z.array(ConversationSummary) },
      },
    },
    async (request) => queries.list(request.account.id),
  )

  api.post(
    '/api/assistant/conversations',
    {
      ...secured,
      schema: {
        operationId: 'createConversation',
        tags,
        response: { 201: z.object({ id: z.string() }) },
      },
    },
    async (request, res) =>
      reply(res, await conversations.create({ actor: request.account }), (value) =>
        res.status(201).send(value),
      ),
  )

  api.get(
    '/api/assistant/conversations/:conversationId',
    {
      ...secured,
      schema: {
        operationId: 'getConversation',
        tags,
        params: ConversationParams,
        response: { 200: ConversationDetail },
      },
    },
    async (request, res) =>
      (await queries.get(request.account.id, request.params.conversationId)) ??
      sendError(res, 'CONVERSATION_NOT_FOUND'),
  )

  api.patch(
    '/api/assistant/conversations/:conversationId',
    {
      ...secured,
      schema: {
        operationId: 'renameConversation',
        tags,
        params: ConversationParams,
        body: RenameConversation,
      },
    },
    async (request, res) =>
      reply(
        res,
        await conversations.rename({
          actor: request.account,
          conversationId: request.params.conversationId,
          title: request.body.title,
        }),
        () => res.status(204).send(),
      ),
  )

  api.delete(
    '/api/assistant/conversations/:conversationId',
    {
      ...secured,
      schema: { operationId: 'deleteConversation', tags, params: ConversationParams },
    },
    async (request, res) =>
      reply(
        res,
        await conversations.delete({
          actor: request.account,
          conversationId: request.params.conversationId,
        }),
        () => res.status(204).send(),
      ),
  )

  /** Answers as server-sent events (contracts/http-api.md); closing the request stops the answer. */
  api.post(
    '/api/assistant/conversations/:conversationId/messages',
    {
      ...secured,
      schema: {
        operationId: 'sendAssistantMessage',
        tags,
        params: ConversationParams,
        body: SendAssistantMessage,
      },
    },
    async (request, res) => {
      const actor = request.account
      const { conversationId } = request.params
      const opened = await send.open({ actor, conversationId })
      if (!opened.ok) return sendError(res, opened.error)
      return streamAnswer(request, res, send.send({ actor, conversationId, ...request.body }))
    },
  )

  /** The answer that follows an applied project (spec 018 US3), streamed like any other. */
  api.post(
    '/api/assistant/conversations/:conversationId/continue',
    {
      ...secured,
      schema: {
        operationId: 'continueAssistantConversation',
        tags,
        params: ConversationParams,
        body: ContinueAssistantConversation,
      },
    },
    async (request, res) => {
      const actor = request.account
      const { conversationId } = request.params
      const opened = await send.openContinue({ actor, conversationId })
      if (!opened.ok) return sendError(res, opened.error)
      return streamAnswer(request, res, send.send({ actor, conversationId, ...request.body }))
    },
  )

  for (const decision of ['apply', 'dismiss'] as const)
    api.post(
      `/api/assistant/proposals/:proposalId/${decision}`,
      {
        ...secured,
        schema: {
          operationId: decision === 'apply' ? 'applyProposal' : 'dismissProposal',
          tags,
          params: ProposalParams,
          response: { 200: Proposal },
        },
      },
      async (request, res) =>
        reply(
          res,
          await proposals[decision]({
            actor: request.account,
            proposalId: request.params.proposalId,
          }),
          (value) => res.send(value),
        ),
    )
}
