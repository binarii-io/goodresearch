import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

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
