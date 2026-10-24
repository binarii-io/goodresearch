import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Foreign keys and checks live in migration SQL (docs/standards.md §6).

/** A person's conversation with the assistant (spec 005 US4), private to them. */
export const assistantConversations = pgTable(
  'assistant_conversations',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('assistant_conversations_account_idx').on(t.accountId, t.lastActivityAt)],
)

export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    role: text('role').notNull(),
    text: text('text').notNull(),
    status: text('status').notNull(),
    failure: text('failure'),
    pageKind: text('page_kind'),
    pageId: text('page_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('assistant_messages_conversation_idx').on(t.conversationId, t.createdAt)],
)

/** An action proposed by the assistant (spec 005 US3); applied only on the person's Apply. */
export const assistantProposals = pgTable(
  'assistant_proposals',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').notNull(),
    callId: text('call_id').notNull(),
    kind: text('kind').notNull(),
    targetId: text('target_id'),
    targetVersion: integer('target_version'),
    values: jsonb('values').notNull(),
    preview: jsonb('preview').notNull(),
    state: text('state').notNull(),
    resultKind: text('result_kind'),
    resultId: text('result_id'),
    error: text('error'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('assistant_proposals_message_idx').on(t.messageId)],
)
