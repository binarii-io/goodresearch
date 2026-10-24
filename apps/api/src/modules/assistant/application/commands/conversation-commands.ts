import { err, ok, type Result } from '@goodresearch/shared'
import type { AssistantDeps } from '../ports.ts'

export type ConversationError = 'CONVERSATION_NOT_FOUND'

/** Spec 005 US4: conversations belong to one person. */
export const makeConversationCommands = (deps: AssistantDeps) => ({
  create: async (c: { actor: { id: string } }): Promise<Result<{ id: string }, never>> => {
    const now = deps.clock.now()
    const id = deps.newId()
    await deps.store.createConversation({
      id,
      accountId: c.actor.id,
      // Empty until the first message: the app shows its translated "New conversation".
      title: '',
      createdAt: now,
      lastActivityAt: now,
    })
    return ok({ id })
  },

  rename: async (c: {
    actor: { id: string }
    conversationId: string
    title: string
  }): Promise<Result<void, ConversationError>> => {
    if (!(await deps.store.getConversation(c.actor.id, c.conversationId)))
      return err('CONVERSATION_NOT_FOUND')
    await deps.store.updateConversation(c.conversationId, { title: c.title.trim() })
    return ok(undefined)
  },

  delete: async (c: {
    actor: { id: string }
    conversationId: string
  }): Promise<Result<void, ConversationError>> => {
    if (!(await deps.store.getConversation(c.actor.id, c.conversationId)))
      return err('CONVERSATION_NOT_FOUND')
    await deps.store.deleteConversation(c.conversationId)
    return ok(undefined)
  },

  /** Account deletion (FR-008): conversations go with the account. */
  forgetAccount: (accountId: string) => deps.store.deleteConversationsOf(accountId),
})

export type ConversationCommands = ReturnType<typeof makeConversationCommands>
