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
import type { Segment } from '../domain/segments.ts'

// Foreign keys to other modules (sessions, studies, teams) live in migration SQL only
// (docs/standards.md §6): a deleted session takes its text and occurrences.

/** The imported text of a validated interview (spec 010 FR-004): its raw version. */
export const transcriptsTranscripts = pgTable('transcripts_transcripts', {
  sessionId: text('session_id').primaryKey(),
  studyId: text('study_id').notNull(),
  fileId: text('file_id').notNull(),
  /** The file's version in Drive when imported: imported again only when it differs. */
  fileModifiedAt: timestamp('file_modified_at', { withTimezone: true }),
  language: text('language').notNull(),
  segments: jsonb('segments').$type<Segment[]>().notNull(),
  importedBy: text('imported_by').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
  /** A reading went through to the end on it (review of PR #10). */
  readAt: timestamp('read_at', { withTimezone: true }),
})

export type StoredVariant = {
  spelling: string
  status: 'proposed' | 'accepted' | 'rejected'
  origin: 'rules' | 'ai' | 'merge'
}

/** A term of a team's lexicon, per language (context map LexiconTerm). */
export const transcriptsLexiconTerms = pgTable(
  'transcripts_lexicon_terms',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id').notNull(),
    language: text('language').notNull(),
    form: text('form').notNull(),
    /** `fold(form)`: one active term per spelling in a team and language. */
    foldedForm: text('folded_form').notNull(),
    kind: text('kind').notNull(),
    correction: text('correction'),
    category: text('category').notNull(),
    definition: text('definition'),
    scope: text('scope').notNull().default('global'),
    scopeDecided: boolean('scope_decided').notNull().default(false),
    status: text('status').notNull(),
    mergedInto: text('merged_into'),
    origin: text('origin').notNull(),
    quote: text('quote'),
    variants: jsonb('variants').$type<StoredVariant[]>().notNull().default([]),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('transcripts_lexicon_terms_form_idx')
      .on(t.teamId, t.language, t.foldedForm)
      .where(sql`${t.status} <> 'merged'`),
    index('transcripts_lexicon_terms_team_idx').on(t.teamId, t.status),
  ],
)

/** How many times a term's spelling appears in one interview, recounted at each reading. */
export const transcriptsOccurrences = pgTable(
  'transcripts_occurrences',
  {
    termId: text('term_id')
      .notNull()
      .references(() => transcriptsLexiconTerms.id, { onDelete: 'cascade' }),
    spelling: text('spelling').notNull(),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    count: integer('count').notNull(),
    anchors: jsonb('anchors').$type<{ segmentId: string; offset: number }[]>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.termId, t.spelling, t.sessionId] }),
    index('transcripts_occurrences_study_idx').on(t.studyId),
  ],
)

export type StoredReading = {
  sessionId: string
  state: 'waiting' | 'reading' | 'done' | 'failed'
  failure?: string
}

/** "Find terms" over a study (research R8): one unfinished at a time per study. */
export const transcriptsLexiconRuns = pgTable(
  'transcripts_lexicon_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    teamId: text('team_id').notNull(),
    startedBy: text('started_by').notNull(),
    sessions: jsonb('sessions').$type<StoredReading[]>().notNull(),
    phase: text('phase').notNull(),
    stopRequested: boolean('stop_requested').notNull().default(false),
    stoppedSessions: jsonb('stopped_sessions').$type<string[]>().notNull().default([]),
    leftOut: integer('left_out').notNull().default(0),
    batchesTotal: integer('batches_total').notNull().default(0),
    batchesDone: integer('batches_done').notNull().default(0),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('transcripts_lexicon_runs_open_idx')
      .on(t.studyId)
      .where(sql`${t.finishedAt} is null`),
    index('transcripts_lexicon_runs_study_idx').on(t.studyId, t.startedAt),
  ],
)

/** A person agreed that text goes to their AI provider for this study, for one purpose. */
export const transcriptsConsents = pgTable(
  'transcripts_consents',
  {
    accountId: text('account_id').notNull(),
    studyId: text('study_id').notNull(),
    provider: text('provider').notNull(),
    /** `lexicon`: excerpts (spec 010); `cleaning`: the full text, names replaced (spec 011). */
    purpose: text('purpose').notNull().default('lexicon'),
    givenAt: timestamp('given_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.studyId, t.provider, t.purpose] })],
)

/** A person's yes / no on one occurrence of a term (spec 010), kept across readings. */
export const transcriptsVerdicts = pgTable(
  'transcripts_verdicts',
  {
    termId: text('term_id')
      .notNull()
      .references(() => transcriptsLexiconTerms.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    studyId: text('study_id').notNull(),
    /** The turn and the start of the occurrence in it: turn ids stay across imports. */
    segmentId: text('segment_id').notNull(),
    offset: integer('offset').notNull(),
    verdict: text('verdict').notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.termId, t.segmentId, t.offset] }),
    index('transcripts_verdicts_study_idx').on(t.studyId),
  ],
)

// Spec 011 — Cleaning. Every row goes with the imported text of its interview.

const ofTranscript = () =>
  text('session_id')
    .notNull()
    .references(() => transcriptsTranscripts.sessionId, { onDelete: 'cascade' })

/** The AI's corrections and a person's own (sources `ai-other`, `person`): research R2. */
export const transcriptsCorrections = pgTable(
  'transcripts_corrections',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    sessionId: ofTranscript(),
    segmentId: text('segment_id').notNull(),
    target: text('target').notNull(),
    offset: integer('offset').notNull(),
    length: integer('length').notNull(),
    original: text('original').notNull(),
    replacement: text('replacement').notNull(),
    edited: text('edited'),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    reason: text('reason'),
    confidence: text('confidence'),
    status: text('status').notNull(),
    runId: text('run_id'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('transcripts_corrections_session_idx').on(t.sessionId),
    uniqueIndex('transcripts_corrections_same_idx').on(
      t.sessionId,
      t.segmentId,
      t.target,
      t.offset,
      t.original,
      t.replacement,
    ),
  ],
)

/** The AI's yes / no on a case-by-case occurrence without verdict. */
export const transcriptsAiSuggestions = pgTable(
  'transcripts_ai_suggestions',
  {
    termId: text('term_id')
      .notNull()
      .references(() => transcriptsLexiconTerms.id, { onDelete: 'cascade' }),
    sessionId: ofTranscript(),
    segmentId: text('segment_id').notNull(),
    offset: integer('offset').notNull(),
    isTerm: boolean('is_term').notNull(),
    reason: text('reason'),
    runId: text('run_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.termId, t.segmentId, t.offset] }),
    index('transcripts_ai_suggestions_session_idx').on(t.sessionId),
  ],
)

/** A person's decision on a computed name correction, by its key. */
export const transcriptsCorrectionDecisions = pgTable(
  'transcripts_correction_decisions',
  {
    sessionId: ofTranscript(),
    key: text('key').notNull(),
    status: text('status').notNull(),
    edited: text('edited'),
    decidedBy: text('decided_by').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.key] })],
)

/** One row per cleaned interview: what the AI has read, and the anonymisation it ran with. */
export const transcriptsCleanings = pgTable('transcripts_cleanings', {
  sessionId: ofTranscript().primaryKey(),
  studyId: text('study_id').notNull(),
  aiReadSegments: jsonb('ai_read_segments').$type<string[]>().notNull().default([]),
  anonymised: boolean('anonymised').notNull(),
  lastRunId: text('last_run_id'),
  cleanedAt: timestamp('cleaned_at', { withTimezone: true }).notNull(),
})

/** The validated clean versions of an interview, numbered. */
export const transcriptsCleanVersions = pgTable(
  'transcripts_clean_versions',
  {
    sessionId: ofTranscript(),
    number: integer('number').notNull(),
    segments: jsonb('segments').$type<Segment[]>().notNull(),
    rawImportedAt: timestamp('raw_imported_at', { withTimezone: true }).notNull(),
    anonymised: boolean('anonymised').notNull(),
    fingerprint: text('fingerprint').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.number] })],
)

/** The Drive document of an interview's clean version. */
export const transcriptsCleanPublications = pgTable('transcripts_clean_publications', {
  sessionId: ofTranscript().primaryKey(),
  fileId: text('file_id').notNull(),
  fileName: text('file_name').notNull(),
  webLink: text('web_link').notNull(),
  versionNumber: integer('version_number').notNull(),
  revision: text('revision'),
  publishedBy: text('published_by').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
})

/** The study's "Clean transcripts" folder, found by its id. */
export const transcriptsCleanFolders = pgTable('transcripts_clean_folders', {
  studyId: text('study_id').primaryKey(),
  folderId: text('folder_id').notNull(),
  name: text('name').notNull(),
})

type StoredProgress = {
  sessionId: string
  state: 'waiting' | 'cleaning' | 'done' | 'failed'
  chunks: number
  chunksDone: number
  failure?: string
}

/** "Clean transcripts" over a study: one unfinished at a time per study. */
export const transcriptsCorrectionRuns = pgTable(
  'transcripts_correction_runs',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    teamId: text('team_id').notNull(),
    startedBy: text('started_by').notNull(),
    mode: text('mode').notNull(),
    sessions: jsonb('sessions').$type<StoredProgress[]>().notNull(),
    stopRequested: boolean('stop_requested').notNull().default(false),
    leftOut: integer('left_out').notNull().default(0),
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('transcripts_correction_runs_open_idx')
      .on(t.studyId)
      .where(sql`${t.finishedAt} is null`),
    index('transcripts_correction_runs_study_idx').on(t.studyId, t.startedAt),
  ],
)
