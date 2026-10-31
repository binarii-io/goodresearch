import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Foreign keys to other modules (sessions, studies) live in migration SQL only
// (docs/standards.md §6): a deleted session takes its evaluation and remarks.

type StoredProgress = {
  sessionId: string
  state: 'waiting' | 'reading' | 'done' | 'failed'
  chunks: number
  chunksDone: number
  failure?: string
}

/** One review of the interviews (spec 016): one unfinished at a time per study. */
export const qualityRuns = pgTable(
  'quality_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    startedBy: text('started_by').notNull(),
    sessions: jsonb('sessions').$type<StoredProgress[]>().notNull(),
    stopRequested: boolean('stop_requested').notNull().default(false),
    leftOut: integer('left_out').notNull().default(0),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('quality_runs_open_idx').on(t.studyId).where(sql`${t.finishedAt} is null`),
    index('quality_runs_study_idx').on(t.studyId, t.startedAt),
  ],
)

/** The last review of an interview: what its derived state compares with. */
export const qualityEvaluations = pgTable('quality_evaluations', {
  sessionId: text('session_id').primaryKey(),
  studyId: text('study_id').notNull(),
  runId: text('run_id').notNull(),
  rawImportedAt: timestamp('raw_imported_at', { withTimezone: true }).notNull(),
  textAnalysed: text('text_analysed').notNull(),
  anonymised: boolean('anonymised').notNull(),
  fingerprint: text('fingerprint').notNull(),
  leftOut: integer('left_out').notNull(),
  turnsSkipped: integer('turns_skipped').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).notNull(),
})

/** Per speaker label: a fixed attribution moves the figures with no AI cost (research R7). */
export const qualitySpeakerCounts = pgTable(
  'quality_speaker_counts',
  {
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    sentences: integer('sentences').notNull(),
    questions: integer('questions').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.speakerLabel] }),
    index('quality_speaker_counts_study_idx').on(t.studyId),
  ],
)

export const qualityReformulations = pgTable(
  'quality_reformulations',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    segmentId: text('segment_id').notNull(),
    offset: integer('offset').notNull(),
    length: integer('length').notNull(),
    text: text('text').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    requalifiedRemarkId: text('requalified_remark_id'),
  },
  (t) => [
    index('quality_reformulations_session_idx').on(t.sessionId),
    index('quality_reformulations_study_idx').on(t.studyId),
  ],
)

export const qualityRemarks = pgTable(
  'quality_remarks',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    runId: text('run_id'),
    segmentId: text('segment_id').notNull(),
    offset: integer('offset').notNull(),
    length: integer('length').notNull(),
    text: text('text').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    kind: text('kind').notNull(),
    reasonEn: text('reason_en'),
    reasonFr: text('reason_fr'),
    reasonPerson: text('reason_person'),
    recommendation: text('recommendation'),
    addedElement: text('added_element'),
    origin: text('origin').notNull(),
    stance: text('stance'),
    stanceBy: text('stance_by'),
    stanceAt: timestamp('stance_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    index('quality_remarks_session_idx').on(t.sessionId, t.segmentId),
    index('quality_remarks_study_idx').on(t.studyId),
    check(
      'quality_remarks_kind_check',
      sql`${t.kind} in ('leading-question', 'reformulation-with-opinion', 'opinion')`,
    ),
    check('quality_remarks_origin_check', sql`${t.origin} in ('ai', 'person')`),
    check('quality_remarks_stance_check', sql`${t.stance} in ('agree', 'disagree')`),
  ],
)

/** A person's consent to send the study's text to their AI provider (FR-014). */
export const qualityConsents = pgTable(
  'quality_consents',
  {
    accountId: text('account_id').notNull(),
    studyId: text('study_id').notNull(),
    provider: text('provider').notNull(),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.studyId] })],
)
