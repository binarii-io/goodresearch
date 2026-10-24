import { newId } from '@goodresearch/shared'
import { and, asc, count, eq, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { IngestionStore, InventoryState, StudySource } from '../application/ports.ts'
import type { FileKind } from '../domain/classify.ts'
import type { FolderAccessResult } from '../domain/folder-access.ts'
import { type InventoryRun, STALE_RUN_MS } from '../domain/inventory-run.ts'
import type { InventoryFile } from '../domain/inventory-walk.ts'
import {
  ingestionFolderAccess,
  ingestionInventoryFiles,
  ingestionOauthStates,
  ingestionSourceConnections,
  ingestionStudySources,
} from './schema.ts'

const CONNECTOR = 'google-drive'

type SourceRow = typeof ingestionStudySources.$inferSelect

/** Writes of a run apply only to the same study, the same folder, this run, still running. */
const currentRun = (run: InventoryRun) =>
  and(
    eq(ingestionStudySources.studyId, run.studyId),
    eq(ingestionStudySources.folderId, run.folderId),
    eq(ingestionStudySources.inventoryRunId, run.runId),
    eq(ingestionStudySources.inventoryStatus, 'running'),
  )

const toSource = (row: SourceRow): StudySource => ({
  studyId: row.studyId,
  folderId: row.folderId,
  folderName: row.folderName,
  ownerName: row.ownerName,
  webViewLink: row.webViewLink,
  attachedBy: row.attachedBy ?? '',
  attachedAt: row.attachedAt,
  inventory: {
    status: row.inventoryStatus as InventoryState['status'],
    startedAt: row.inventoryStartedAt,
    finishedAt: row.inventoryFinishedAt,
    runBy: row.inventoryRunBy,
    progress: row.inventoryProgress ?? null,
    failure: row.inventoryFailure as InventoryState['failure'],
    lastSuccessAt: row.lastSuccessAt,
  },
})

export const createIngestionStore = (db: Db): IngestionStore => ({
  getConnection: async (accountId) => {
    const [row] = await db
      .select()
      .from(ingestionSourceConnections)
      .where(
        and(
          eq(ingestionSourceConnections.accountId, accountId),
          eq(ingestionSourceConnections.connector, CONNECTOR),
        ),
      )
    return row
      ? { ...row, connector: CONNECTOR, status: row.status === 'lost' ? 'lost' : 'connected' }
      : null
  },

  saveConnection: async (c) => {
    await db
      .insert(ingestionSourceConnections)
      .values(c)
      .onConflictDoUpdate({
        target: [ingestionSourceConnections.accountId, ingestionSourceConnections.connector],
        set: {
          externalAccount: c.externalAccount,
          encryptedRefreshToken: c.encryptedRefreshToken,
          status: c.status,
          connectedAt: c.connectedAt,
        },
      })
  },

  markConnectionLost: async (accountId) => {
    await db
      .update(ingestionSourceConnections)
      .set({ status: 'lost' })
      .where(eq(ingestionSourceConnections.accountId, accountId))
  },

  deleteConnection: async (accountId) => {
    await db
      .delete(ingestionSourceConnections)
      .where(eq(ingestionSourceConnections.accountId, accountId))
  },

  saveOauthState: async (s, now) => {
    await db.delete(ingestionOauthStates).where(lte(ingestionOauthStates.expiresAt, now))
    await db.insert(ingestionOauthStates).values({ ...s, connector: CONNECTOR })
  },

  takeOauthState: async (state, now) => {
    await db.delete(ingestionOauthStates).where(lt(ingestionOauthStates.expiresAt, now))
    const [row] = await db
      .delete(ingestionOauthStates)
      .where(eq(ingestionOauthStates.state, state))
      .returning()
    return row && row.expiresAt > now ? row : null
  },

  getSource: async (studyId) => {
    const [row] = await db
      .select()
      .from(ingestionStudySources)
      .where(eq(ingestionStudySources.studyId, studyId))
    return row ? toSource(row) : null
  },

  attachSource: async (s) => {
    await db.transaction(async (tx) => {
      await tx.delete(ingestionInventoryFiles).where(eq(ingestionInventoryFiles.studyId, s.studyId))
      await tx.delete(ingestionFolderAccess).where(eq(ingestionFolderAccess.studyId, s.studyId))
      const values = {
        studyId: s.studyId,
        connector: CONNECTOR,
        folderId: s.folderId,
        folderName: s.folderName,
        ownerName: s.ownerName,
        webViewLink: s.webViewLink,
        attachedBy: s.attachedBy,
        attachedAt: s.attachedAt,
        inventoryStatus: 'never',
        inventoryStartedAt: null,
        inventoryFinishedAt: null,
        inventoryRunBy: null,
        inventoryProgress: null,
        inventoryFailure: null,
        lastSuccessAt: null,
        // Clearing the run id invalidates any run of the previous folder (see InventoryRun).
        inventoryRunId: null,
      }
      await tx
        .insert(ingestionStudySources)
        .values(values)
        .onConflictDoUpdate({ target: ingestionStudySources.studyId, set: values })
    })
  },

  deleteSource: async (studyId) => {
    await db.transaction(async (tx) => {
      await tx.delete(ingestionInventoryFiles).where(eq(ingestionInventoryFiles.studyId, studyId))
      await tx.delete(ingestionFolderAccess).where(eq(ingestionFolderAccess.studyId, studyId))
      await tx.delete(ingestionStudySources).where(eq(ingestionStudySources.studyId, studyId))
    })
  },

  startInventory: async (studyId, runBy, now) => {
    const runId = newId()
    // Atomic: one active run per study (FR-015); a run older than STALE_RUN_MS is considered dead.
    const [run] = await db
      .update(ingestionStudySources)
      .set({
        inventoryStatus: 'running',
        inventoryStartedAt: now,
        inventoryRunBy: runBy,
        inventoryProgress: { folders: 0, files: 0 },
        inventoryFailure: null,
        inventoryRunId: runId,
      })
      .where(
        and(
          eq(ingestionStudySources.studyId, studyId),
          or(
            sql`${ingestionStudySources.inventoryStatus} <> 'running'`,
            lt(ingestionStudySources.inventoryStartedAt, new Date(now.getTime() - STALE_RUN_MS)),
          ),
        ),
      )
      .returning({ folderId: ingestionStudySources.folderId })
    return run ? { studyId, folderId: run.folderId, runId } : null
  },

  updateProgress: async (run, progress) => {
    await db
      .update(ingestionStudySources)
      .set({ inventoryProgress: progress })
      .where(currentRun(run))
  },

  completeInventory: async (run, files, folder, now) =>
    db.transaction(async (tx) => {
      // Mark the run done first: if it is no longer current (folder replaced or detached), stop.
      const updated = await tx
        .update(ingestionStudySources)
        .set({
          folderName: folder.name,
          ownerName: folder.ownerName,
          inventoryStatus: 'done',
          inventoryFinishedAt: now,
          inventoryFailure: null,
          inventoryProgress: null,
          lastSuccessAt: now,
        })
        .where(currentRun(run))
        .returning({ studyId: ingestionStudySources.studyId })
      if (updated.length === 0) return false
      await tx
        .delete(ingestionInventoryFiles)
        .where(eq(ingestionInventoryFiles.studyId, run.studyId))
      for (let i = 0; i < files.length; i += 1000) {
        await tx.insert(ingestionInventoryFiles).values(
          files.slice(i, i + 1000).map((f) => ({
            studyId: run.studyId,
            fileId: f.id,
            name: f.name,
            kind: f.kind,
            group: f.group,
            mimeType: f.mimeType,
            size: f.size,
            modifiedAt: f.modifiedAt ? new Date(f.modifiedAt) : null,
            webViewLink: f.webViewLink,
          })),
        )
      }
      return true
    }),

  failInventory: async (run, failure, now) => {
    await db
      .update(ingestionStudySources)
      .set({
        inventoryStatus: 'failed',
        inventoryFailure: failure,
        inventoryFinishedAt: now,
        inventoryProgress: null,
      })
      .where(currentRun(run))
  },

  getFolderAccess: async (studyId, accountId) => {
    const [row] = await db
      .select()
      .from(ingestionFolderAccess)
      .where(
        and(
          eq(ingestionFolderAccess.studyId, studyId),
          eq(ingestionFolderAccess.accountId, accountId),
        ),
      )
    return row ? { result: row.result as FolderAccessResult, checkedAt: row.checkedAt } : null
  },

  saveFolderAccess: async (studyId, accountId, result, now) => {
    await db
      .insert(ingestionFolderAccess)
      .values({ studyId, accountId, result, checkedAt: now })
      .onConflictDoUpdate({
        target: [ingestionFolderAccess.studyId, ingestionFolderAccess.accountId],
        set: { result, checkedAt: now },
      })
  },

  clearFolderAccessOf: async (accountId) => {
    await db.delete(ingestionFolderAccess).where(eq(ingestionFolderAccess.accountId, accountId))
  },

  listFiles: async (studyId, filter) => {
    const rows = await db
      .select()
      .from(ingestionInventoryFiles)
      .where(
        and(
          eq(ingestionInventoryFiles.studyId, studyId),
          filter.kind ? eq(ingestionInventoryFiles.kind, filter.kind) : undefined,
          filter.group ? eq(ingestionInventoryFiles.group, filter.group) : undefined,
        ),
      )
      .orderBy(asc(ingestionInventoryFiles.group), asc(ingestionInventoryFiles.name))
    return rows.map(
      (r): InventoryFile => ({
        id: r.fileId,
        name: r.name,
        kind: r.kind as FileKind,
        group: r.group,
        mimeType: r.mimeType,
        size: r.size,
        modifiedAt: r.modifiedAt?.toISOString() ?? null,
        webViewLink: r.webViewLink,
      }),
    )
  },

  totals: async (studyId) => {
    const kinds = await db
      .select({ kind: ingestionInventoryFiles.kind, value: count() })
      .from(ingestionInventoryFiles)
      .where(eq(ingestionInventoryFiles.studyId, studyId))
      .groupBy(ingestionInventoryFiles.kind)
    const groups = await db
      .select({ group: ingestionInventoryFiles.group, value: count() })
      .from(ingestionInventoryFiles)
      .where(eq(ingestionInventoryFiles.studyId, studyId))
      .groupBy(ingestionInventoryFiles.group)
      .orderBy(asc(ingestionInventoryFiles.group))
    const byKind: Record<FileKind, number> = { transcript: 0, media: 0, other: 0 }
    for (const k of kinds) byKind[k.kind as FileKind] = k.value
    return { byKind, byGroup: groups.map((g) => ({ group: g.group, count: g.value })) }
  },

  folderSummaries: async (accountId, studyIds) => {
    if (studyIds.length === 0) return new Map()
    const rows = await db
      .select({
        studyId: ingestionStudySources.studyId,
        name: ingestionStudySources.folderName,
        access: ingestionFolderAccess.result,
      })
      .from(ingestionStudySources)
      .leftJoin(
        ingestionFolderAccess,
        and(
          eq(ingestionFolderAccess.studyId, ingestionStudySources.studyId),
          eq(ingestionFolderAccess.accountId, accountId),
        ),
      )
      .where(inArray(ingestionStudySources.studyId, [...studyIds]))
    return new Map(
      rows.map((r) => [r.studyId, { folderName: r.access === 'granted' ? r.name : null }]),
    )
  },

  accountName: async (accountId) => {
    const [row] = await db
      .select({ name: auth_users.name, status: auth_users.status })
      .from(auth_users)
      .where(eq(auth_users.id, accountId))
    return row && row.status !== 'deleted' ? row.name : null
  },
})
