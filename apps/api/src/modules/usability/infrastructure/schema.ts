import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Foreign keys to other modules (studies, sessions, accounts) and checks live in the migration SQL
// (docs/standards.md §6): an analysis goes with its session and its study.

/** The analysis of one test session (spec 038): the current one per session, replaced by a new one. */
export const usabilityAnalyses = pgTable(
  'usability_analyses',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    sessionId: text('session_id').notNull(),
    protocolVersion: integer('protocol_version').notNull(),
    videoFileId: text('video_file_id').notNull(),
    videoModifiedAt: text('video_modified_at'),
    videoSize: bigint('video_size', { mode: 'number' }),
    state: text('state').notNull(),
    stage: text('stage'),
    failure: text('failure'),
    runId: text('run_id'),
    startedBy: text('started_by').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    uniqueIndex('usability_analyses_session_idx').on(t.sessionId),
    index('usability_analyses_study_idx').on(t.studyId),
  ],
)

/** The full transcript the analysis made of the session's video (FR-012). */
export const usabilityTranscripts = pgTable('usability_transcripts', {
  analysisId: text('analysis_id').primaryKey(),
  language: text('language'),
  segments: jsonb('segments')
    .$type<{ speaker: string; startMs: number; endMs: number; text: string }[]>()
    .notNull(),
})

/** One task of one session: its outcome, time and path (FR-005). */
export const usabilityTaskResults = pgTable(
  'usability_task_results',
  {
    id: text('id').primaryKey(),
    analysisId: text('analysis_id').notNull(),
    taskId: text('task_id').notNull(),
    outcome: text('outcome').notNull(),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
    timeOnTaskMs: integer('time_on_task_ms'),
    path: text('path').notNull().default(''),
    ease: integer('ease'),
    status: text('status').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [uniqueIndex('usability_task_results_task_idx').on(t.analysisId, t.taskId)],
)

/** One finding of a session, proposed by the analysis or added by a person (FR-006, FR-009). */
export const usabilityObservations = pgTable(
  'usability_observations',
  {
    id: text('id').primaryKey(),
    analysisId: text('analysis_id').notNull(),
    taskId: text('task_id'),
    kind: text('kind').notNull(),
    momentMs: integer('moment_ms').notNull(),
    text: text('text').notNull(),
    quote: text('quote'),
    seen: text('seen'),
    susItem: integer('sus_item'),
    susValue: integer('sus_value'),
    screenshotKey: text('screenshot_key'),
    judge: text('judge'),
    judgeReason: text('judge_reason'),
    arbiter: text('arbiter'),
    arbiterReason: text('arbiter_reason'),
    origin: text('origin').notNull(),
    status: text('status').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [index('usability_observations_analysis_idx').on(t.analysisId, t.taskId)],
)

/**
 * Screenshots kept in the app's storage (FR-020). No foreign key: a row outlives its observation
 * so the sweep can delete the stored image once nothing refers to it.
 */
export const usabilityScreenshots = pgTable('usability_screenshots', {
  key: text('key').primaryKey(),
  studyId: text('study_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

/** "Analyse sessions" over a study: one running at a time (spec 038 FR-002). */
export const usabilityAnalysisRuns = pgTable(
  'usability_analysis_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    startedBy: text('started_by').notNull(),
    sessionIds: jsonb('session_ids').$type<string[]>().notNull(),
    state: text('state').notNull(),
    stopRequested: boolean('stop_requested').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('usability_analysis_runs_running_idx')
      .on(t.studyId)
      .where(sql`${t.state} = 'running'`),
  ],
)
