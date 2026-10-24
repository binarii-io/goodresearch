import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Foreign keys to accounts and the append-only rule live in migration SQL (docs/standards.md §6).

/** A person's own AI provider (spec 004): one per account, credential encrypted (FR-006). */
export const aiProviderConnections = pgTable('ai_provider_connections', {
  accountId: text('account_id').primaryKey(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  encryptedCredential: text('encrypted_credential').notNull(),
  credentialHint: text('credential_hint'),
  googleAccount: text('google_account'),
  gcpProject: text('gcp_project'),
  gcpRegion: text('gcp_region'),
  status: text('status').notNull(),
  lastFailure: text('last_failure'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** A Google Cloud consent given but not yet checked (data-model.md), kept for one hour. */
export const aiPendingGoogleGrants = pgTable('ai_pending_google_grants', {
  accountId: text('account_id').primaryKey(),
  encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
  googleAccount: text('google_account'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

/** Single-use OAuth state of the Google Cloud consent (PKCE verifier, return path). */
export const aiOauthStates = pgTable('ai_oauth_states', {
  state: text('state').primaryKey(),
  accountId: text('account_id').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  returnTo: text('return_to').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

/** One row per AI call (FR-010): append-only, never prompt or answer text. */
export const aiUsageEntries = pgTable(
  'ai_usage_entries',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms').notNull(),
    outcome: text('outcome').notNull(),
    ref: text('ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ai_usage_entries_account_idx').on(t.accountId, t.createdAt),
    index('ai_usage_entries_ref_idx').on(t.accountId, t.ref),
  ],
)
