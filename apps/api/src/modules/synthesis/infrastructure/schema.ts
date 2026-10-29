import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Foreign keys to other modules (projects) live in migration SQL only (docs/standards.md §6): a
// deleted project takes its insights and runs. Links have no key to the facts (Evidence's table):
// a deleted fact shows "deleted" (research R7).

/** "Find insights" over a project (spec 013): one unfinished at a time per project. */
export const synthesisRuns = pgTable(
  'synthesis_runs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    teamId: text('team_id').notNull(),
    startedBy: text('started_by').notNull(),
    studyIds: jsonb('study_ids').$type<string[]>().notNull(),
    scope: text('scope').$type<'all' | 'unlinked'>().notNull(),
    withProposed: boolean('with_proposed').notNull().default(false),
    calls: integer('calls').notNull().default(0),
    callsDone: integer('calls_done').notNull().default(0),
    stopRequested: boolean('stop_requested').notNull().default(false),
    leftOut: integer('left_out').notNull().default(0),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('synthesis_runs_open_idx').on(t.projectId).where(sql`${t.finishedAt} is null`),
    index('synthesis_runs_project_idx').on(t.projectId, t.startedAt),
  ],
)

/** Context map Insight (Synthesis): a project-level finding over accepted facts. */
export const synthesisInsights = pgTable(
  'synthesis_insights',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    themeKey: text('theme_key').notNull(),
    themeTitle: text('theme_title'),
    statementEn: text('statement_en').notNull(),
    statementFr: text('statement_fr').notNull(),
    descriptionEn: text('description_en').notNull(),
    descriptionFr: text('description_fr').notNull(),
    counterEn: text('counter_en').notNull(),
    counterFr: text('counter_fr').notNull(),
    minorityEn: text('minority_en').notNull(),
    minorityFr: text('minority_fr').notNull(),
    translation: text('translation').notNull().default('done'),
    /** What a failed translation sends again: `{ from, fields }` (review of PR #13). */
    pendingTranslation: jsonb('pending_translation').$type<{
      from: 'en' | 'fr'
      fields: ('statement' | 'description' | 'counterEvidence' | 'minorityView')[]
    }>(),
    origin: text('origin').notNull(),
    status: text('status').notNull(),
    runId: text('run_id'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [index('synthesis_insights_project_idx').on(t.projectId, t.status)],
)

/** An insight ↔ a fact, with the fact as it was when linked or last reviewed (research R7). */
export const synthesisInsightFacts = pgTable(
  'synthesis_insight_facts',
  {
    insightId: text('insight_id')
      .notNull()
      .references(() => synthesisInsights.id, { onDelete: 'cascade' }),
    factId: text('fact_id').notNull(),
    role: text('role').notNull(),
    state: text('state').notNull(),
    origin: text('origin').notNull(),
    factVersion: integer('fact_version').notNull(),
    factPolarity: text('fact_polarity').notNull(),
    factThemeId: text('fact_theme_id'),
    factStatementEn: text('fact_statement_en').notNull(),
    by: text('by').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.insightId, t.factId] }),
    index('synthesis_insight_facts_fact_idx').on(t.factId),
  ],
)

/** A person's consent to send a project's fact lines to their provider (FR-017). */
export const synthesisConsents = pgTable(
  'synthesis_consents',
  {
    accountId: text('account_id').notNull(),
    projectId: text('project_id').notNull(),
    provider: text('provider').notNull(),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.projectId] })],
)
