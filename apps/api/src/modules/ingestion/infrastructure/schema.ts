import { sql } from 'drizzle-orm'
import {
  bigint,
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

// Foreign keys to other modules (accounts, studies) live in migration SQL only (docs/standards.md §6).

/** A person's own grant to read a source (FR-007, FR-010): one per account and connector. */
export const ingestionSourceConnections = pgTable(
  'ingestion_source_connections',
  {
    accountId: text('account_id').notNull(),
    connector: text('connector').notNull(),
    externalAccount: text('external_account').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    status: text('status').notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull(),
    /** `write`: the person also lets goodresearch edit the files they can edit (spec 007). */
    access: text('access').notNull().default('read'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.connector] })],
)

/** The folder attached to a study and the state of its last inventory. */
export const ingestionStudySources = pgTable('ingestion_study_sources', {
  studyId: text('study_id').primaryKey(),
  connector: text('connector').notNull(),
  folderId: text('folder_id').notNull(),
  folderName: text('folder_name').notNull(),
  ownerName: text('owner_name'),
  webViewLink: text('web_view_link').notNull(),
  attachedBy: text('attached_by'),
  attachedAt: timestamp('attached_at', { withTimezone: true }).notNull(),
  inventoryStatus: text('inventory_status').notNull(),
  inventoryStartedAt: timestamp('inventory_started_at', { withTimezone: true }),
  inventoryFinishedAt: timestamp('inventory_finished_at', { withTimezone: true }),
  inventoryRunBy: text('inventory_run_by'),
  inventoryProgress: jsonb('inventory_progress').$type<{ folders: number; files: number }>(),
  inventoryFailure: text('inventory_failure'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  /** Unique id of the current run; writes of other runs are ignored (see InventoryRun). */
  inventoryRunId: text('inventory_run_id'),
  version: integer('version').notNull().default(0),
})

/** Files of the last successful inventory; replaced atomically on success. */
export const ingestionInventoryFiles = pgTable(
  'ingestion_inventory_files',
  {
    studyId: text('study_id').notNull(),
    fileId: text('file_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    group: text('group_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: bigint('size', { mode: 'number' }),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    webViewLink: text('web_view_link').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.studyId, t.fileId] }),
    index('ingestion_inventory_files_kind_idx').on(t.studyId, t.kind),
  ],
)

/** Result of the last check of a person's own access to a study's folder (FR-010a). */
export const ingestionFolderAccess = pgTable(
  'ingestion_folder_access',
  {
    studyId: text('study_id').notNull(),
    accountId: text('account_id').notNull(),
    result: text('result').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.studyId, t.accountId] })],
)

/** Short-lived OAuth state (PKCE verifier) between "connect" and the callback. */
export const ingestionOauthStates = pgTable('ingestion_oauth_states', {
  state: text('state').primaryKey(),
  accountId: text('account_id').notNull(),
  connector: text('connector').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  returnTo: text('return_to').notNull(),
  access: text('access').notNull().default('read'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

/** The interviews (sessions) of a study, built from its inventory (spec 008). */
export const ingestionSessions = pgTable(
  'ingestion_sessions',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    /** Null for a recording without its transcript. */
    transcriptFileId: text('transcript_file_id'),
    media: jsonb('media')
      .$type<{ fileId: string; confidence: 'high' | 'medium' | 'low' | null; reason: string }[]>()
      .notNull(),
    mediaEdited: boolean('media_edited').notNull().default(false),
    state: text('state').notNull(),
    excludedReason: text('excluded_reason'),
    title: text('title'),
    /** A planned interview of the research module (no foreign key across modules). */
    plannedInterviewId: text('planned_interview_id'),
    linkedBy: text('linked_by'),
    roster: jsonb('roster')
      .$type<
        {
          id: string
          name: string
          role: 'interviewer' | 'interviewee'
          memberId: string | null
        }[]
      >()
      .notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    uniqueIndex('ingestion_sessions_transcript_idx').on(t.studyId, t.transcriptFileId),
    uniqueIndex('ingestion_sessions_planned_idx')
      .on(t.studyId, t.plannedInterviewId)
      .where(sql`${t.plannedInterviewId} is not null`),
    index('ingestion_sessions_state_idx').on(t.studyId, t.state),
  ],
)
