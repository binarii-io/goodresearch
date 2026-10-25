import { and, eq, inArray } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { PublishingStore, StoredChange, StoredPublication } from '../application/ports.ts'
import { publishingChanges, publishingDocuments } from './schema.ts'

type DocRow = typeof publishingDocuments.$inferSelect
type ChangeRow = typeof publishingChanges.$inferSelect

const toPublication = (r: DocRow): StoredPublication => ({
  ...r,
  kind: r.kind as StoredPublication['kind'],
  language: r.language === 'fr' ? 'fr' : 'en',
  base: r.base as StoredPublication['base'],
  drive: (r.drive as StoredPublication['drive']) ?? null,
  state: r.state as StoredPublication['state'],
  unavailableReason: r.unavailableReason as StoredPublication['unavailableReason'],
})

const toChange = (r: ChangeRow): StoredChange => ({
  ...r,
  kind: r.kind as StoredChange['kind'],
  decision: r.decision as StoredChange['decision'],
})

/** `undefined` values (an item removed in Drive) are stored as SQL null and read back as such. */
const changeRow = (c: StoredChange) => ({
  ...c,
  base: c.base ?? null,
  app: c.app ?? null,
  drive: c.drive ?? null,
})

const undef = (c: StoredChange): StoredChange => ({
  ...c,
  base: c.base ?? undefined,
  app: c.app ?? undefined,
  drive: c.drive ?? undefined,
})

export const createPublishingStore = (db: Db): PublishingStore => ({
  listByStudy: async (studyId) =>
    (
      await db.select().from(publishingDocuments).where(eq(publishingDocuments.studyId, studyId))
    ).map(toPublication),

  get: async (id) => {
    const [row] = await db.select().from(publishingDocuments).where(eq(publishingDocuments.id, id))
    return row ? toPublication(row) : null
  },

  insert: async (p) => {
    const inserted = await db
      .insert(publishingDocuments)
      .values(p)
      .onConflictDoNothing()
      .returning({ id: publishingDocuments.id })
    return inserted.length > 0
  },

  save: async (p) => {
    const { id, ...rest } = p
    await db.update(publishingDocuments).set(rest).where(eq(publishingDocuments.id, id))
  },

  saveBase: async (p, expectedRev) => {
    const { id, ...rest } = p
    const updated = await db
      .update(publishingDocuments)
      .set(rest)
      .where(and(eq(publishingDocuments.id, id), eq(publishingDocuments.baseRev, expectedRev)))
      .returning({ id: publishingDocuments.id })
    return updated.length > 0
  },

  saveCheck: async (p, pending) => {
    await db.transaction(async (tx) => {
      // The row is locked: an update or a decision cannot change the base in between.
      const [row] = await tx
        .select({ baseRev: publishingDocuments.baseRev })
        .from(publishingDocuments)
        .where(eq(publishingDocuments.id, p.id))
        .for('update')
      if (!row || row.baseRev !== p.baseRev) return
      await tx
        .update(publishingDocuments)
        .set({
          drive: p.drive,
          checkedVersion: p.checkedVersion,
          checkedRevision: p.checkedRevision,
          appVersion: p.appVersion,
          state: p.state,
          unavailableReason: p.unavailableReason,
          lastCheckedAt: p.lastCheckedAt,
          lastEditor: p.lastEditor,
          fileName: p.fileName,
        })
        .where(eq(publishingDocuments.id, p.id))
      if (pending === null) return
      await tx
        .delete(publishingChanges)
        .where(
          and(eq(publishingChanges.publicationId, p.id), eq(publishingChanges.decision, 'pending')),
        )
      if (pending.length) await tx.insert(publishingChanges).values(pending.map(changeRow))
    })
  },

  touchChecked: async (id, at) => {
    await db
      .update(publishingDocuments)
      .set({ lastCheckedAt: at })
      .where(eq(publishingDocuments.id, id))
  },

  delete: async (id) => {
    await db.delete(publishingDocuments).where(eq(publishingDocuments.id, id))
  },

  changes: async (publicationId) =>
    (
      await db
        .select()
        .from(publishingChanges)
        .where(eq(publishingChanges.publicationId, publicationId))
    ).map((r) => undef(toChange(r))),

  replacePending: async (publicationId, changes) => {
    await db.transaction(async (tx) => {
      await tx
        .delete(publishingChanges)
        .where(
          and(
            eq(publishingChanges.publicationId, publicationId),
            eq(publishingChanges.decision, 'pending'),
          ),
        )
      if (changes.length) await tx.insert(publishingChanges).values(changes.map(changeRow))
    })
  },

  decide: async (publicationId, ids, decision, by, at) => {
    if (!ids.length) return []
    const rows = await db
      .update(publishingChanges)
      .set({ decision, decidedBy: by, decidedAt: at })
      .where(
        and(
          inArray(publishingChanges.id, [...ids]),
          eq(publishingChanges.publicationId, publicationId),
          eq(publishingChanges.decision, 'pending'),
        ),
      )
      .returning()
    return rows.map((r) => undef(toChange(r)))
  },

  undecide: async (ids) => {
    if (!ids.length) return
    await db
      .update(publishingChanges)
      .set({ decision: 'pending', decidedBy: null, decidedAt: null })
      .where(inArray(publishingChanges.id, [...ids]))
  },

  clearChanges: async (publicationId) => {
    await db.delete(publishingChanges).where(eq(publishingChanges.publicationId, publicationId))
  },

  changesOf: async (ids) =>
    ids.length
      ? (
          await db
            .select()
            .from(publishingChanges)
            .where(inArray(publishingChanges.publicationId, [...ids]))
        ).map((r) => undef(toChange(r)))
      : [],

  accountNames: async (ids) =>
    new Map(
      ids.length
        ? (
            await db
              .select({ id: auth_users.id, name: auth_users.name })
              .from(auth_users)
              .where(inArray(auth_users.id, [...ids]))
          ).map((r) => [r.id, r.name])
        : [],
    ),
})
