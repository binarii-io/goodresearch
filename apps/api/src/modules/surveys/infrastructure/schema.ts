import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Foreign keys to other modules and checks live in migration SQL (docs/standards.md §6).

/** One response read from a study's form (spec 028): never who answered, no contact item. */
export const surveysResponses = pgTable(
  'surveys_responses',
  {
    studyId: text('study_id').notNull(),
    sourceId: text('source_id').notNull(),
    formFileId: text('form_file_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    consent: text('consent').notNull(),
    answers: jsonb('answers').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.studyId, t.sourceId] }),
    index('surveys_responses_form_idx').on(t.studyId, t.formFileId, t.submittedAt),
  ],
)

export const surveysReadings = pgTable('surveys_readings', {
  studyId: text('study_id').primaryKey(),
  status: text('status').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  readBy: text('read_by'),
  unknownQuestions: integer('unknown_questions').notNull(),
  unknownValues: integer('unknown_values').notNull(),
})

export const surveysTargetRules = pgTable('surveys_target_rules', {
  studyId: text('study_id').primaryKey(),
  accepted: jsonb('accepted').notNull(),
  version: integer('version').notNull().default(0),
  origin: text('origin').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

/** The wording responses submitted before `until` answered. */
export const surveysItemWordings = pgTable(
  'surveys_item_wordings',
  {
    studyId: text('study_id').notNull(),
    itemId: text('item_id').notNull(),
    text: text('text').notNull(),
    until: timestamp('until', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.studyId, t.itemId, t.until] })],
)

/** Spec 029: a theme of one open item's answers, proposed by AI on masked text or by a person. */
export const surveysThemes = pgTable(
  'surveys_themes',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    itemId: text('item_id').notNull(),
    labelEn: text('label_en').notNull(),
    labelFr: text('label_fr').notNull(),
    descriptionEn: text('description_en').notNull(),
    descriptionFr: text('description_fr').notNull(),
    translation: text('translation').notNull().default('done'),
    origin: text('origin').notNull(),
    status: text('status').notNull(),
    mergedInto: text('merged_into'),
    version: integer('version').notNull().default(1),
    runId: text('run_id'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('surveys_themes_item_idx').on(t.studyId, t.itemId, t.status)],
)

/** The answers of a theme: an answer is in at most one theme of its item. */
export const surveysThemeAnswers = pgTable(
  'surveys_theme_answers',
  {
    themeId: text('theme_id')
      .notNull()
      .references(() => surveysThemes.id, { onDelete: 'cascade' }),
    studyId: text('study_id').notNull(),
    itemId: text('item_id').notNull(),
    sourceId: text('source_id').notNull(),
    /** The verified excerpt of the masked answer, when the AI quoted it. */
    quote: text('quote'),
  },
  (t) => [
    primaryKey({ columns: [t.themeId, t.sourceId] }),
    uniqueIndex('surveys_theme_answers_one_idx').on(t.studyId, t.itemId, t.sourceId),
  ],
)

export const surveysThemeRuns = pgTable(
  'surveys_theme_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    itemId: text('item_id').notNull(),
    state: text('state').notNull(),
    parts: integer('parts').notNull(),
    partsDone: integer('parts_done').notNull().default(0),
    answersSent: integer('answers_sent').notNull().default(0),
    leftOut: integer('left_out').notNull().default(0),
    droppedQuotes: integer('dropped_quotes').notNull().default(0),
    droppedThemes: integer('dropped_themes').notNull().default(0),
    failure: text('failure'),
    startedBy: text('started_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('surveys_theme_runs_item_idx').on(t.studyId, t.itemId),
    uniqueIndex('surveys_theme_runs_live_idx').on(t.studyId).where(sql`${t.state} = 'running'`),
  ],
)
