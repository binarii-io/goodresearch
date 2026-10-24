import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type {
  AiFailure,
  AssistantStore,
  ProposalPreview,
  StoredMessage,
  StoredProposal,
} from '../application/ports.ts'
import type { ProposalKind, ProposalState } from '../domain/proposal.ts'
import { assistantConversations, assistantMessages, assistantProposals } from './schema.ts'

type ProposalRow = typeof assistantProposals.$inferSelect
type MessageRow = typeof assistantMessages.$inferSelect

const toMessage = (r: MessageRow): StoredMessage => ({
  id: r.id,
  conversationId: r.conversationId,
  role: r.role === 'assistant' ? 'assistant' : 'person',
  text: r.text,
  status: r.status as StoredMessage['status'],
  failure: r.failure as AiFailure | null,
  pageKind: r.pageKind,
  pageId: r.pageId,
  createdAt: r.createdAt,
})

const toProposal = (r: ProposalRow): StoredProposal => ({
  id: r.id,
  messageId: r.messageId,
  callId: r.callId,
  kind: r.kind as ProposalKind,
  targetId: r.targetId,
  targetVersion: r.targetVersion,
  values: r.values as Record<string, unknown>,
  preview: r.preview as ProposalPreview,
  state: r.state as ProposalState,
  resultKind: r.resultKind === 'project' || r.resultKind === 'study' ? r.resultKind : null,
  resultId: r.resultId,
  error: r.error,
  decidedAt: r.decidedAt,
})

export const createAssistantStore = (db: Db): AssistantStore => ({
  listConversations: async (accountId) =>
    db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.accountId, accountId))
      .orderBy(desc(assistantConversations.lastActivityAt)),

  getConversation: async (accountId, id) => {
    const [row] = await db
      .select()
      .from(assistantConversations)
      .where(
        and(eq(assistantConversations.id, id), eq(assistantConversations.accountId, accountId)),
      )
    return row ?? null
  },

  createConversation: async (c) => {
    await db.insert(assistantConversations).values(c)
  },

  updateConversation: async (id, change) => {
    await db.update(assistantConversations).set(change).where(eq(assistantConversations.id, id))
  },

  deleteConversation: async (id) => {
    await db.delete(assistantConversations).where(eq(assistantConversations.id, id))
  },

  deleteConversationsOf: async (accountId) => {
    await db.delete(assistantConversations).where(eq(assistantConversations.accountId, accountId))
  },

  listMessages: async (conversationId) =>
    (
      await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, conversationId))
        .orderBy(asc(assistantMessages.createdAt))
    ).map(toMessage),

  saveMessage: async (m) => {
    const { id: _, ...update } = m
    await db
      .insert(assistantMessages)
      .values(m)
      .onConflictDoUpdate({ target: assistantMessages.id, set: update })
  },

  listProposals: async (conversationId) => {
    const ids = db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversationId))
    return (
      await db.select().from(assistantProposals).where(inArray(assistantProposals.messageId, ids))
    ).map(toProposal)
  },

  saveProposal: async (p) => {
    const { id: _, ...update } = p
    await db
      .insert(assistantProposals)
      .values(p)
      .onConflictDoUpdate({ target: assistantProposals.id, set: update })
  },

  transitionProposal: async (id, from, to) => {
    const { id: _, ...update } = to
    const changed = await db
      .update(assistantProposals)
      .set(update)
      .where(and(eq(assistantProposals.id, id), eq(assistantProposals.state, from)))
      .returning({ id: assistantProposals.id })
    return changed.length === 1
  },

  getProposal: async (id) => {
    const [row] = await db
      .select({ proposal: assistantProposals, ownerId: assistantConversations.accountId })
      .from(assistantProposals)
      .innerJoin(assistantMessages, eq(assistantMessages.id, assistantProposals.messageId))
      .innerJoin(
        assistantConversations,
        eq(assistantConversations.id, assistantMessages.conversationId),
      )
      .where(eq(assistantProposals.id, id))
    return row ? { proposal: toProposal(row.proposal), ownerId: row.ownerId } : null
  },
})
