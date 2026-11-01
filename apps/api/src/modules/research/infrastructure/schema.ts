import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
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
    /** Spec 019: the owner; the key to the workspace's teams is added in SQL, as for projects. */
    teamId: text('team_id').notNull(),
    /** Spec 019: read by the AI steps inside the study. */
    goal: text('goal').notNull().default(''),
    name: text('name').notNull(),
    type: text('type').notNull(),
    /** Spec 009: names and titles use pseudonyms. */
    anonymised: boolean('anonymised').notNull().default(false),
    /** Spec 012: the text Analysis reads, `with-corrections` or `clean-only`. */
    textAnalysed: text('text_analysed').notNull().default('with-corrections'),
    createdBy: text('created_by').references(() => auth_users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [index('research_studies_team_updated_idx').on(t.teamId, t.updatedAt)],
)

/** Spec 019: the projects a study feeds. Deleting a project takes its links, not its studies. */
export const researchStudyProjects = pgTable(
  'research_study_projects',
  {
    studyId: text('study_id')
      .notNull()
      .references(() => researchStudies.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => researchProjects.id, { onDelete: 'cascade' }),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.studyId, t.projectId] }),
    index('research_study_projects_project_idx').on(t.projectId),
  ],
)

/** One interview guide per study (spec 006); the content is checked by the domain. */
export const researchInterviewGuides = pgTable('research_interview_guides', {
  studyId: text('study_id')
    .primaryKey()
    .references(() => researchStudies.id, { onDelete: 'cascade' }),
  content: jsonb('content').notNull(),
  origin: text('origin').notNull(),
  updatedBy: text('updated_by').references(() => auth_users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  version: integer('version').notNull().default(0),
})

/** The interview schedule of a study (spec 006 US5). */
export const researchPlannedInterviews = pgTable(
  'research_planned_interviews',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id')
      .notNull()
      .references(() => researchStudies.id, { onDelete: 'cascade' }),
    interviewee: text('interviewee').notNull(),
    role: text('role').notNull().default(''),
    interviewers: text('interviewers').notNull().default(''),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    status: text('status').notNull(),
    notes: text('notes').notNull().default(''),
    createdBy: text('created_by').references(() => auth_users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [index('research_planned_interviews_study_idx').on(t.studyId, t.scheduledAt)],
)
