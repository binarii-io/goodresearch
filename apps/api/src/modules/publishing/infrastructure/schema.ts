import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

// Foreign keys to other modules (studies, accounts) live in migration SQL only (docs/standards.md §6).

/** A file published from a study's preparation (spec 007, PublishedDocument). */
export const publishingDocuments = pgTable(
  'publishing_documents',
  {
    id: text('id').primaryKey(),
    studyId: text('study_id').notNull(),
    kind: text('kind').notNull(),
    fileId: text('file_id').notNull(),
    fileName: text('file_name').notNull(),
    webLink: text('web_link').notNull(),
    language: text('language').notNull(),
    timeZone: text('time_zone'),
    base: jsonb('base').notNull(),
    baseVersion: integer('base_version').notNull(),
    baseRevision: text('base_revision'),
    /** Increases at every change of the base (publish, update, decision): guards checks. */
    baseRev: integer('base_rev').notNull().default(0),
    drive: jsonb('drive'),
    checkedVersion: integer('checked_version'),
    checkedRevision: text('checked_revision'),
    appVersion: integer('app_version'),
    state: text('state').notNull(),
    unavailableReason: text('unavailable_reason'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastEditor: text('last_editor'),
    publishedBy: text('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('publishing_documents_study_kind_idx').on(t.studyId, t.kind)],
)

/** One difference read from a published file, and the decision on it (spec 007, DriveChange). */
export const publishingChanges = pgTable(
  'publishing_changes',
  {
    id: text('id').primaryKey(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publishingDocuments.id, { onDelete: 'cascade' }),
    key: text('item_key').notNull(),
    kind: text('kind').notNull(),
    base: jsonb('base'),
    app: jsonb('app'),
    drive: jsonb('drive'),
    decision: text('decision').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [index('publishing_changes_publication_idx').on(t.publicationId)],
)
