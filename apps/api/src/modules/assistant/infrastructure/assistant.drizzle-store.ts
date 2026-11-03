import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type {
  AiFailure,
  AssistantStore,
  ProposalPreview,
  StoredMessage,
  StoredProposal,
} from '../application/ports.ts'
import type { ProposalKind, ProposalState } from '../domain/proposal.ts'
import {
  assistantConversations,
  assistantFolderConsents,
  assistantMessages,
  assistantProposals,
} from './schema.ts'

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

/** The answers on a study's page, in conversations holding such a proposal made there. */
const answersOf = async (db: Db, studyId: string, proposal: SQL | undefined) => {
  const conversations = db
    .selectDistinct({ id: assistantMessages.conversationId })
    .from(assistantProposals)
    .innerJoin(assistantMessages, eq(assistantMessages.id, assistantProposals.messageId))
    .where(and(proposal, eq(assistantMessages.pageId, studyId)))
  return (
    await db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .where(
        and(
          inArray(assistantMessages.conversationId, conversations),
          eq(assistantMessages.role, 'assistant'),
          eq(assistantMessages.pageId, studyId),
        ),
      )
  ).map((m) => m.id)
}

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
    await db.delete(assistantFolderConsents).where(eq(assistantFolderConsents.accountId, accountId))
  },

  hasFolderConsent: async (accountId, studyId, provider) => {
    const rows = await db
      .select({ provider: assistantFolderConsents.provider })
      .from(assistantFolderConsents)
      .where(
        and(
          eq(assistantFolderConsents.accountId, accountId),
          eq(assistantFolderConsents.studyId, studyId),
          eq(assistantFolderConsents.provider, provider),
        ),
      )
    return rows.length > 0
  },

  saveFolderConsent: async (accountId, studyId, provider, at) => {
    await db
      .insert(assistantFolderConsents)
      .values({ accountId, studyId, provider, givenAt: at })
      .onConflictDoNothing()
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

  answersWithSkill: (studyId, skill) =>
    answersOf(
      db,
      studyId,
      and(
        eq(assistantProposals.kind, 'load_skill'),
        eq(assistantProposals.state, 'applied'),
        sql`${assistantProposals.values}->>'name' = ${skill}`,
      ),
    ),

  answersWithCard: (studyId, kind) => answersOf(db, studyId, eq(assistantProposals.kind, kind)),

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
