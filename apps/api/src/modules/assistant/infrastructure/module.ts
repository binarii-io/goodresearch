import { type Clock, newId } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import type { Gateway } from '../../ai-gateway/index.ts'
import { makeConversationCommands } from '../application/commands/conversation-commands.ts'
import { makeProposalCommands } from '../application/commands/proposal-commands.ts'
import { makeSendMessage } from '../application/commands/send-message.ts'
import type { AssistantDeps, ResearchActions, ResearchReads } from '../application/ports.ts'
import { makeConversationQueries } from '../application/queries/conversation-queries.ts'
import { createAssistantStore } from './assistant.drizzle-store.ts'
import type { AssistantHandlers } from './http.routes.ts'

/** Builds the assistant module (spec 005); research and the gateway come through ports. */
export const createAssistantModule = (deps: {
  db: Db
  clock: Clock
  gateway: Pick<Gateway, 'stream'>
  research: ResearchReads
  actions: ResearchActions
  costs: AssistantDeps['costs']
  log?: { warn(object: object, message: string): void }
}) => {
  const assistant: AssistantDeps = {
    store: createAssistantStore(deps.db),
    gateway: deps.gateway,
    research: deps.research,
    actions: deps.actions,
    costs: deps.costs,
    clock: deps.clock,
    newId,
    log: deps.log ?? console,
  }
  const conversations = makeConversationCommands(assistant)
  const handlers: AssistantHandlers = {
    conversations,
    send: makeSendMessage(assistant),
    proposals: makeProposalCommands(assistant),
    queries: makeConversationQueries(assistant),
  }
  return { handlers, forgetAccount: conversations.forgetAccount }
}
