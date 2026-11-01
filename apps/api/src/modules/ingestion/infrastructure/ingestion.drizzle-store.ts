import { newId } from '@goodresearch/shared'
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  TransactionRollbackError,
} from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type {
  AnalysisRun,
  IngestionStore,
  InventoryState,
  SessionWrite,
  StudySource,
} from '../application/ports.ts'
import type { Analysis } from '../domain/analysis.ts'
import type { FileKind } from '../domain/classify.ts'
import type { FolderAccessResult } from '../domain/folder-access.ts'
import { type InventoryRun, STALE_RUN_MS } from '../domain/inventory-run.ts'
import type { InventoryFile } from '../domain/inventory-walk.ts'
import { assignPseudonyms } from '../domain/pseudonyms.ts'
import { reconcileSessions } from '../domain/reconcile-sessions.ts'
import {
  givesUpRecordings,
  type Session,
  type SessionState,
  withoutRecordings,
} from '../domain/session.ts'
import {
  ingestionAnalysisConsents,
  ingestionAnalysisRuns,
  ingestionFolderAccess,
  ingestionInventoryFiles,
  ingestionOauthStates,
  ingestionPseudonyms,
  ingestionSessions,
  ingestionSourceConnections,
  ingestionStudySources,
  type StoredAnalysis,
} from './schema.ts'

const CONNECTOR = 'google-drive'

type SourceRow = typeof ingestionStudySources.$inferSelect
type SessionRow = typeof ingestionSessions.$inferSelect
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const toAnalysis = (a: StoredAnalysis | null): Analysis | null =>
  a ? { ...a, at: a.at ? new Date(a.at) : null } : null

const storedAnalysis = (a: Analysis | null): StoredAnalysis | null =>
  a ? { ...a, at: a.at?.toISOString() ?? null } : null

const toSession = (r: SessionRow): Session => ({
  ...r,
  state: r.state as Session['state'],
  linkedBy: r.linkedBy as Session['linkedBy'],
  language: r.language as Session['language'],
  analysis: toAnalysis(r.analysis),
})

type RunRow = typeof ingestionAnalysisRuns.$inferSelect
const toRun = (r: RunRow): AnalysisRun => ({ ...r, state: r.state as AnalysisRun['state'] })

const sessionValues = (s: Session) => ({
  studyId: s.studyId,
  transcriptFileId: s.transcriptFileId,
  media: [...s.media],
  mediaEdited: s.mediaEdited,
  state: s.state,
  excludedReason: s.excludedReason,
  title: s.title,
  plannedInterviewId: s.plannedInterviewId,
  linkedBy: s.linkedBy,
  roster: [...s.roster],
  decidedBy: s.decidedBy,
  decidedAt: s.decidedAt,
  interviewDate: s.interviewDate,
  language: s.language,
  attachments: [...s.attachments],
  analysis: storedAnalysis(s.analysis),
  updatedAt: s.updatedAt,
})

/** Postgres unique violation: here, a planned interview already held by another session. */
const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause)
    if ((e as { code?: string }).code === '23505') return true
  return false
}

/** One writer of a study's sessions at a time: recordings stay in one session (FR-004). */
const lockSessions = (tx: Tx, studyId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sessions:${studyId}`}))`)

const writeSession = async (tx: Tx, s: Session, expected: number): Promise<SessionWrite> => {
  if (s.media.length || s.attachments.length) {
    const held = await tx
      .select({
        id: ingestionSessions.id,
        media: ingestionSessions.media,
        attachments: ingestionSessions.attachments,
      })
      .from(ingestionSessions)
      .where(and(eq(ingestionSessions.studyId, s.studyId), ne(ingestionSessions.id, s.id)))
    // A file belongs to one interview at most, as a recording or an attachment (spec 009 R11).
    const mine = new Set([...s.media.map((m) => m.fileId), ...s.attachments.map((a) => a.fileId)])
    if (
      held.some(
        (o) =>
          o.media.some((m) => mine.has(m.fileId)) || o.attachments.some((a) => mine.has(a.fileId)),
      )
    )
      return 'media-taken'
  }
  const rows = await tx
    .update(ingestionSessions)
    .set({ ...sessionValues(s), version: expected + 1 })
    .where(and(eq(ingestionSessions.id, s.id), eq(ingestionSessions.version, expected)))
    .returning({ id: ingestionSessions.id })
  return rows.length ? 'saved' : 'stale'
}

/** Spec 008 FR-002: the sessions follow the files of the inventory, decided ones excepted. */
const reconcile = async (tx: Tx, studyId: string, files: readonly InventoryFile[], now: Date) => {
  await lockSessions(tx, studyId)
  const sessions = (
    await tx.select().from(ingestionSessions).where(eq(ingestionSessions.studyId, studyId))
  ).map(toSession)
  const r = reconcileSessions({ studyId, files, sessions, now, newId })
  const seen = new Map(sessions.map((s) => [s.id, s.version]))
  // Conditional on the version read: a person's change made meanwhile wins.
  for (const id of r.removed)
    await tx.delete(ingestionSessions).where(
      and(
        eq(ingestionSessions.id, id),
        // Not decided by a person: proposed, or validated by the app (FR-002c).
        isNull(ingestionSessions.decidedBy),
        eq(ingestionSessions.version, seen.get(id) ?? -1),
      ),
    )
  for (const m of r.media)
    await tx
      .update(ingestionSessions)
      .set({ media: [...m.media], updatedAt: now, version: (seen.get(m.id) ?? 0) + 1 })
      .where(
        and(
          eq(ingestionSessions.id, m.id),
          // Not decided by a person: proposed, or validated by the app (FR-002c).
          isNull(ingestionSessions.decidedBy),
          eq(ingestionSessions.version, seen.get(m.id) ?? -1),
        ),
      )
  for (let i = 0; i < r.created.length; i += 500)
    await tx
      .insert(ingestionSessions)
      .values(
        r.created.slice(i, i + 500).map((s) => ({
          ...sessionValues(s),
          id: s.id,
          createdAt: s.createdAt,
          version: s.version,
        })),
      )
      .onConflictDoNothing()
}

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
      ? {
          ...row,
          connector: CONNECTOR,
          status: row.status === 'lost' ? 'lost' : 'connected',
          access: row.access === 'write' ? 'write' : 'read',
        }
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
          access: c.access,
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
    return row && row.expiresAt > now
      ? { ...row, access: row.access === 'write' ? ('write' as const) : ('read' as const) }
      : null
  },

  getSource: async (studyId) => {
    const [row] = await db
      .select()
      .from(ingestionStudySources)
      .where(eq(ingestionStudySources.studyId, studyId))
    return row ? toSource(row) : null
  },

  attachNewSource: async (s) => {
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
    }
    const inserted = await db
      .insert(ingestionStudySources)
      .values(values)
      .onConflictDoNothing({ target: ingestionStudySources.studyId })
      .returning({ studyId: ingestionStudySources.studyId })
    return inserted.length > 0
  },

  attachSource: async (s) => {
    await db.transaction(async (tx) => {
      await tx.delete(ingestionInventoryFiles).where(eq(ingestionInventoryFiles.studyId, s.studyId))
      await tx.delete(ingestionSessions).where(eq(ingestionSessions.studyId, s.studyId))
      await tx.delete(ingestionAnalysisRuns).where(eq(ingestionAnalysisRuns.studyId, s.studyId))
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
      await tx.delete(ingestionSessions).where(eq(ingestionSessions.studyId, studyId))
      await tx.delete(ingestionAnalysisRuns).where(eq(ingestionAnalysisRuns.studyId, studyId))
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

  completeInventory: async (run, files, folder, now, options) =>
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
      if (options?.sessions !== false) await reconcile(tx, run.studyId, files, now)
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

  accountNames: async (accountIds) => {
    const ids = [...new Set(accountIds)]
    if (ids.length === 0) return new Map()
    const rows = await db
      .select({ id: auth_users.id, name: auth_users.name, status: auth_users.status })
      .from(auth_users)
      .where(inArray(auth_users.id, ids))
    return new Map(rows.filter((r) => r.status !== 'deleted').map((r) => [r.id, r.name]))
  },

  accountName: async (accountId) => {
    const [row] = await db
      .select({ name: auth_users.name, status: auth_users.status })
      .from(auth_users)
      .where(eq(auth_users.id, accountId))
    return row && row.status !== 'deleted' ? row.name : null
  },

  listSessions: async (studyId) =>
    (await db.select().from(ingestionSessions).where(eq(ingestionSessions.studyId, studyId))).map(
      toSession,
    ),

  sessionSummaries: async (studyId) =>
    (
      await db
        .select({
          id: ingestionSessions.id,
          state: ingestionSessions.state,
          title: ingestionSessions.title,
          interviewDate: ingestionSessions.interviewDate,
          language: ingestionSessions.language,
          transcriptFileId: ingestionSessions.transcriptFileId,
        })
        .from(ingestionSessions)
        .where(eq(ingestionSessions.studyId, studyId))
    ).map((row) => ({
      ...row,
      state: row.state as SessionState,
      language: row.language as Session['language'],
    })),

  sessionIds: async (studyId) =>
    (
      await db
        .select({ id: ingestionSessions.id })
        .from(ingestionSessions)
        .where(eq(ingestionSessions.studyId, studyId))
    ).map((row) => row.id),

  analysedSessionIds: async (studyId) =>
    (
      await db
        .select({ sessionIds: ingestionAnalysisRuns.sessionIds })
        .from(ingestionAnalysisRuns)
        .where(eq(ingestionAnalysisRuns.studyId, studyId))
    ).flatMap((row) => row.sessionIds),

  sessionRosters: async (studyId) =>
    (
      await db
        .select({
          id: ingestionSessions.id,
          state: ingestionSessions.state,
          roster: ingestionSessions.roster,
        })
        .from(ingestionSessions)
        .where(eq(ingestionSessions.studyId, studyId))
    ).map((row) => ({ ...row, state: row.state as SessionState })),

  getSession: async (id) => {
    const [row] = await db.select().from(ingestionSessions).where(eq(ingestionSessions.id, id))
    return row ? toSession(row) : null
  },

  saveSession: async (s, expected, release = []) => {
    let written: SessionWrite = 'stale'
    try {
      return await db.transaction(async (tx) => {
        await lockSessions(tx, s.studyId)
        if (release.length) {
          const taken = new Set(s.media.map((m) => m.fileId))
          const rows = await tx
            .select()
            .from(ingestionSessions)
            .where(
              and(
                inArray(ingestionSessions.id, [...release]),
                eq(ingestionSessions.studyId, s.studyId),
                isNull(ingestionSessions.transcriptFileId),
              ),
            )
          for (const row of rows.map(toSession).filter(givesUpRecordings)) {
            const rest = withoutRecordings(row, taken, s.updatedAt)
            if (rest) await writeSession(tx, rest, row.version)
            else await tx.delete(ingestionSessions).where(eq(ingestionSessions.id, row.id))
          }
        }
        written = await writeSession(tx, s, expected)
        // Released sessions come back when the write does not happen.
        if (written !== 'saved') tx.rollback()
        return written
      })
    } catch (error) {
      if (error instanceof TransactionRollbackError) return written
      if (isUniqueViolation(error)) return 'linked'
      throw error
    }
  },

  backfillSessions: async (studyId, now) => {
    await db.transaction(async (tx) => {
      // The lock first: files read after an inventory that commits meanwhile are its files.
      await lockSessions(tx, studyId)
      const files = (
        await tx
          .select()
          .from(ingestionInventoryFiles)
          .where(eq(ingestionInventoryFiles.studyId, studyId))
      ).map(
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
      await reconcile(tx, studyId, files, now)
    })
  },

  writeAnalysis: async (sessionId, expected, analysis) => {
    const rows = await db
      .update(ingestionSessions)
      .set({ analysis: storedAnalysis(analysis), version: expected + 1 })
      .where(and(eq(ingestionSessions.id, sessionId), eq(ingestionSessions.version, expected)))
      .returning({ id: ingestionSessions.id })
    return rows.length ? 'saved' : 'stale'
  },

  ensurePseudonyms: async (studyId, needed, now, prefix = 'P') => {
    // Nothing to give: a plain read, no lock and no write (spec 011 queries).
    if (needed.length === 0)
      return new Map(
        (
          await db
            .select({ key: ingestionPseudonyms.nameKey, code: ingestionPseudonyms.code })
            .from(ingestionPseudonyms)
            .where(eq(ingestionPseudonyms.studyId, studyId))
        ).map((r) => [r.key, r.code]),
      )
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pseudonyms:${studyId}`}))`)
      const rows = await tx
        .select({ key: ingestionPseudonyms.nameKey, code: ingestionPseudonyms.code })
        .from(ingestionPseudonyms)
        .where(eq(ingestionPseudonyms.studyId, studyId))
      const codes = new Map(rows.map((r) => [r.key, r.code]))
      const fresh = assignPseudonyms(codes, needed, prefix)
      if (fresh.length)
        await tx
          .insert(ingestionPseudonyms)
          .values(fresh.map((f) => ({ studyId, nameKey: f.key, code: f.code, createdAt: now })))
      for (const f of fresh) codes.set(f.key, f.code)
      return codes
    })
  },

  hasConsent: async (accountId, studyId, provider) => {
    const [row] = await db
      .select({ at: ingestionAnalysisConsents.givenAt })
      .from(ingestionAnalysisConsents)
      .where(
        and(
          eq(ingestionAnalysisConsents.accountId, accountId),
          eq(ingestionAnalysisConsents.studyId, studyId),
          eq(ingestionAnalysisConsents.provider, provider),
        ),
      )
    return row !== undefined
  },

  saveConsent: async (accountId, studyId, provider, now) => {
    await db
      .insert(ingestionAnalysisConsents)
      .values({ accountId, studyId, provider, givenAt: now })
      .onConflictDoNothing()
  },

  startRun: async (run) =>
    db.transaction(async (tx) => {
      // A run without heartbeat for 10 minutes died with its worker: it is replaced.
      await tx
        .update(ingestionAnalysisRuns)
        .set({ state: 'stopped', finishedAt: run.startedAt })
        .where(
          and(
            eq(ingestionAnalysisRuns.studyId, run.studyId),
            eq(ingestionAnalysisRuns.state, 'running'),
            lt(ingestionAnalysisRuns.heartbeatAt, new Date(run.startedAt.getTime() - 10 * 60_000)),
          ),
        )
      const inserted = await tx
        .insert(ingestionAnalysisRuns)
        .values({ ...run, sessionIds: [...run.sessionIds] })
        .onConflictDoNothing()
        .returning({ id: ingestionAnalysisRuns.id })
      return inserted.length > 0
    }),

  lastRun: async (studyId) => {
    const rows = await db
      .select()
      .from(ingestionAnalysisRuns)
      .where(eq(ingestionAnalysisRuns.studyId, studyId))
      .orderBy(
        sql`${ingestionAnalysisRuns.state} = 'running' desc`,
        sql`${ingestionAnalysisRuns.startedAt} desc`,
      )
      .limit(1)
    return rows[0] ? toRun(rows[0]) : null
  },

  getRun: async (runId) => {
    const [row] = await db
      .select()
      .from(ingestionAnalysisRuns)
      .where(eq(ingestionAnalysisRuns.id, runId))
    return row ? toRun(row) : null
  },

  heartbeat: async (runId, now) => {
    await db
      .update(ingestionAnalysisRuns)
      .set({ heartbeatAt: now })
      .where(eq(ingestionAnalysisRuns.id, runId))
  },

  requestStop: async (runId) => {
    await db
      .update(ingestionAnalysisRuns)
      .set({ stopRequested: true })
      .where(and(eq(ingestionAnalysisRuns.id, runId), eq(ingestionAnalysisRuns.state, 'running')))
  },

  finishRun: async (runId, state, now) => {
    await db
      .update(ingestionAnalysisRuns)
      .set({ state, finishedAt: now })
      .where(and(eq(ingestionAnalysisRuns.id, runId), eq(ingestionAnalysisRuns.state, 'running')))
  },

  renameFile: async (studyId, fileId, name, modifiedAt) => {
    await db
      .update(ingestionInventoryFiles)
      .set({ name, ...(modifiedAt ? { modifiedAt: new Date(modifiedAt) } : {}) })
      .where(
        and(
          eq(ingestionInventoryFiles.studyId, studyId),
          eq(ingestionInventoryFiles.fileId, fileId),
        ),
      )
  },

  moveLink: async (from, to, expected) => {
    try {
      return await db.transaction(async (tx) => {
        await lockSessions(tx, to.studyId)
        const cleared = await writeSession(tx, from, expected.from)
        if (cleared !== 'saved') return cleared
        const saved = await writeSession(tx, to, expected.to)
        if (saved !== 'saved') tx.rollback()
        return saved
      })
    } catch (error) {
      if (isUniqueViolation(error)) return 'linked'
      if (error instanceof TransactionRollbackError) return 'stale'
      throw error
    }
  },
})
