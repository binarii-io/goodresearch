import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { auth_users } from '#platform/auth/auth-schema.ts'

export const researchProjects = pgTable(
  'research_projects',
  {
    id: text('id').primaryKey(),
    // Team of the workspace module, referenced by id only. The foreign key (ON DELETE RESTRICT) lives in
    // migration 0001 so that this module never imports another module's tables (docs/standards.md §6).
    teamId: text('team_id').notNull(),
    name: text('name').notNull(),
    goal: text('goal').notNull().default(''),
    createdBy: text('created_by').references(() => auth_users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [index('research_projects_team_updated_idx').on(t.teamId, t.updatedAt)],
)

export const researchStudies = pgTable(
  'research_studies',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => researchProjects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(),
    createdBy: text('created_by').references(() => auth_users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [index('research_studies_project_updated_idx').on(t.projectId, t.updatedAt)],
)
