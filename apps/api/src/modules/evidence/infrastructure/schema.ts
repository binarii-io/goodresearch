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

// Foreign keys to other modules (sessions, studies) live in migration SQL only
// (docs/standards.md §6): a deleted session takes its verbatims and facts.

type StoredProgress = {
  sessionId: string
  state: 'waiting' | 'verbatims' | 'facts' | 'done' | 'failed'
  chunks: number
  chunksDone: number
  failure?: string
}

/** "Find facts" over a study (spec 012): one unfinished at a time per study. */
export const evidenceRuns = pgTable(
  'evidence_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    teamId: text('team_id').notNull(),
    startedBy: text('started_by').notNull(),
    sessions: jsonb('sessions').$type<StoredProgress[]>().notNull(),
    stopRequested: boolean('stop_requested').notNull().default(false),
    stoppedSessions: jsonb('stopped_sessions').$type<string[]>().notNull().default([]),
    leftOut: jsonb('left_out')
      .$type<{ verbatims: number; facts: number }>()
      .notNull()
      .default({ verbatims: 0, facts: 0 }),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('evidence_runs_open_idx').on(t.studyId).where(sql`${t.finishedAt} is null`),
    index('evidence_runs_study_idx').on(t.studyId, t.startedAt),
  ],
)

/** The last reading of an interview: what its derived state compares with (research R3). */
export const evidenceReadings = pgTable('evidence_readings', {
  sessionId: text('session_id').primaryKey(),
  studyId: text('study_id').notNull(),
  runId: text('run_id').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }).notNull(),
  rawImportedAt: timestamp('raw_imported_at', { withTimezone: true }).notNull(),
  textAnalysed: text('text_analysed').notNull(),
  anonymised: boolean('anonymised').notNull(),
  fingerprint: text('fingerprint').notNull(),
})

/** An exact excerpt of an interviewee's turn. */
export const evidenceVerbatims = pgTable(
  'evidence_verbatims',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    segmentId: text('segment_id').notNull(),
    offset: integer('offset').notNull(),
    length: integer('length').notNull(),
    text: text('text').notNull(),
    speaker: text('speaker'),
    /** The interviewee's code (`P01`); null: the speaker is to attribute. */
    participant: text('participant'),
    reason: text('reason'),
    origin: text('origin').notNull(),
    runId: text('run_id'),
    setAside: boolean('set_aside').notNull().default(false),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('evidence_verbatims_session_idx').on(t.sessionId, t.segmentId)],
)

/** A neutral statement supported by verbatims of one interview (context map Fact). */
export const evidenceFacts = pgTable(
  'evidence_facts',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    statementEn: text('statement_en').notNull(),
    statementFr: text('statement_fr').notNull(),
    translation: text('translation').notNull().default('done'),
    polarity: text('polarity').notNull(),
    themeId: text('theme_id'),
    themeTitle: text('theme_title'),
    origin: text('origin').notNull(),
    status: text('status').notNull(),
    runId: text('run_id'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('evidence_facts_session_idx').on(t.sessionId),
    index('evidence_facts_study_idx').on(t.studyId, t.status),
  ],
)

export const evidenceFactVerbatims = pgTable(
  'evidence_fact_verbatims',
  {
    factId: text('fact_id')
      .notNull()
      .references(() => evidenceFacts.id, { onDelete: 'cascade' }),
    verbatimId: text('verbatim_id')
      .notNull()
      .references(() => evidenceVerbatims.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.factId, t.verbatimId] }),
    index('evidence_fact_verbatims_verbatim_idx').on(t.verbatimId),
  ],
)

/** A person's attribution of a speaker label the app could not match (research R8). */
export const evidenceSpeakers = pgTable(
  'evidence_speakers',
  {
    sessionId: text('session_id').notNull(),
    speaker: text('speaker').notNull(),
    participant: text('participant').notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.speaker] })],
)

/** A person's consent to send the study's text to their AI provider (FR-014). */
export const evidenceConsents = pgTable(
  'evidence_consents',
  {
    accountId: text('account_id').notNull(),
    studyId: text('study_id').notNull(),
    provider: text('provider').notNull(),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.studyId] })],
)
