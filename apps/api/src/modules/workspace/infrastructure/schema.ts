import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { auth_users } from '#platform/auth/auth-schema.ts'

/** Singleton tenant row, seeded by the `migrate` entrypoint. */
export const workspaceWorkspaces = pgTable('workspace_workspaces', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const workspaceTeams = pgTable('workspace_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** lower(trim(name)): uniqueness ignores case and surrounding spaces. */
  nameKey: text('name_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  version: integer('version').notNull().default(0),
})

export const workspaceTeamMemberships = pgTable(
  'workspace_team_memberships',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => workspaceTeams.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => auth_users.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
    grantedBy: text('granted_by').references(() => auth_users.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.accountId] }),
    index('workspace_team_memberships_account_idx').on(t.accountId),
  ],
)

/** Append-only (a trigger rejects UPDATE and DELETE, see the migration). */
export const workspaceAccessEvents = pgTable(
  'workspace_access_events',
  {
    id: text('id').primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    actorId: text('actor_id').references(() => auth_users.id),
    subjectId: text('subject_id')
      .notNull()
      .references(() => auth_users.id),
    type: text('type').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index('workspace_access_events_subject_idx').on(t.subjectId, t.occurredAt)],
)
