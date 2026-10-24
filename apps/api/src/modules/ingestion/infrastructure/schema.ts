import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
