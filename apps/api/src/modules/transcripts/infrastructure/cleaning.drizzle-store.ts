import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { CleaningStore, CleanVersion } from '../application/ports.ts'
import type { CleaningFailure, CorrectionRun } from '../domain/correction-run.ts'
import type {
  Confidence,
  Correction,
  CorrectionKind,
  CorrectionSource,
  CorrectionStatus,
  NameDecision,
  Target,
} from '../domain/corrections.ts'
import {
  transcriptsAiSuggestions,
  transcriptsCleanFolders,
  transcriptsCleanings,
  transcriptsCleanPublications,
  transcriptsCleanVersions,
  transcriptsCorrectionDecisions,
  transcriptsCorrectionRuns,
  transcriptsCorrections,
} from './schema.ts'

type CorrectionRow = typeof transcriptsCorrections.$inferSelect
type RunRow = typeof transcriptsCorrectionRuns.$inferSelect

const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause)
    if ((e as { code?: string }).code === '23505') return true
  return false
}

const toCorrection = (r: CorrectionRow): Correction => ({
  key: r.id,
  sessionId: r.sessionId,
  segmentId: r.segmentId,
  target: r.target as Target,
  offset: r.offset,
  length: r.length,
  original: r.original,
  replacement: r.replacement,
  edited: r.edited,
  kind: r.kind as CorrectionKind,
  source: r.source as CorrectionSource,
  reason: r.reason,
  confidence: r.confidence as Confidence | null,
  termId: null,
  status: r.status as CorrectionStatus,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
})

const correctionValues = (c: Correction) => ({
  edited: c.edited,
  status: c.status,
  decidedBy: c.decidedBy,
  decidedAt: c.decidedAt,
  version: c.version ?? 1,
})

const toRun = (r: RunRow): CorrectionRun => ({
  id: r.id,
  studyId: r.studyId,
  teamId: r.teamId,
  startedBy: r.startedBy,
  mode: r.mode as CorrectionRun['mode'],
  sessions: r.sessions.map((s) => ({
    sessionId: s.sessionId,
    state: s.state,
    chunks: s.chunks,
    chunksDone: s.chunksDone,
    ...(s.failure ? { failure: s.failure as CleaningFailure } : {}),
  })),
  stopRequested: r.stopRequested,
  leftOut: r.leftOut,
  failure: r.failure as CleaningFailure | null,
  startedAt: r.startedAt,
  heartbeatAt: r.heartbeatAt,
  finishedAt: r.finishedAt,
})

const runValues = (run: CorrectionRun) => ({
  sessions: run.sessions.map((s) => ({ ...s })),
  leftOut: run.leftOut,
  failure: run.failure,
  heartbeatAt: run.heartbeatAt,
  finishedAt: run.finishedAt,
})

/** Spec 011: corrections, clean versions, publications and cleaning runs in Postgres. */
export const createCleaningStore = (db: Db): CleaningStore => ({
  storedCorrections: async (sessionId) =>
    (
      await db
        .select()
        .from(transcriptsCorrections)
        .where(eq(transcriptsCorrections.sessionId, sessionId))
    ).map(toCorrection),

  insertCorrection: async (c, studyId, runId, at) => {
    try {
      await db.insert(transcriptsCorrections).values({
        id: c.key,
        studyId,
        sessionId: c.sessionId,
        segmentId: c.segmentId,
        target: c.target,
        offset: c.offset,
        length: c.length,
        original: c.original,
        replacement: c.replacement,
        kind: c.kind,
        source: c.source,
        reason: c.reason,
        confidence: c.confidence,
        runId,
        createdAt: at,
        ...correctionValues(c),
      })
      return 'ok'
    } catch (error) {
      if (isUniqueViolation(error)) return 'exists'
      throw error
    }
  },

  saveCorrection: async (c, expected) => {
    const rows = await db
      .update(transcriptsCorrections)
      .set(correctionValues(c))
      .where(
        and(eq(transcriptsCorrections.id, c.key), eq(transcriptsCorrections.version, expected)),
      )
      .returning({ id: transcriptsCorrections.id })
    return rows.length > 0 ? 'ok' : 'stale'
  },

  replaceFindings: async (input) => {
    await db.transaction(async (tx) => {
      const read = [...input.readSegments]
      if (read.length > 0) {
        await tx
          .delete(transcriptsCorrections)
          .where(
            and(
              eq(transcriptsCorrections.sessionId, input.sessionId),
              eq(transcriptsCorrections.source, 'ai-other'),
              eq(transcriptsCorrections.status, 'proposed'),
              inArray(transcriptsCorrections.segmentId, read),
            ),
          )
        await tx
          .delete(transcriptsAiSuggestions)
          .where(
            and(
              eq(transcriptsAiSuggestions.sessionId, input.sessionId),
              inArray(transcriptsAiSuggestions.segmentId, read),
            ),
          )
      }
      if (input.corrections.length > 0)
        await tx
          .insert(transcriptsCorrections)
          .values(
            input.corrections.map((c) => ({
              id: c.key,
              studyId: input.studyId,
              sessionId: c.sessionId,
              segmentId: c.segmentId,
              target: c.target,
              offset: c.offset,
              length: c.length,
              original: c.original,
              replacement: c.replacement,
              kind: c.kind,
              source: c.source,
              reason: c.reason,
              confidence: c.confidence,
              runId: input.runId,
              createdAt: input.at,
              ...correctionValues(c),
            })),
          )
          // A decided correction already there stays as it is.
          .onConflictDoNothing()
      if (input.suggestions.length > 0)
        await tx
          .insert(transcriptsAiSuggestions)
          .values(input.suggestions.map((s) => ({ ...s, runId: input.runId })))
          .onConflictDoUpdate({
            target: [
              transcriptsAiSuggestions.termId,
              transcriptsAiSuggestions.segmentId,
              transcriptsAiSuggestions.offset,
            ],
            set: {
              isTerm: sql`excluded.is_term`,
              reason: sql`excluded.reason`,
              runId: sql`excluded.run_id`,
            },
          })
      await tx
        .insert(transcriptsCleanings)
        .values({
          sessionId: input.sessionId,
          studyId: input.studyId,
          aiReadSegments: read,
          anonymised: input.anonymised,
          lastRunId: input.runId,
          cleanedAt: input.at,
        })
        .onConflictDoUpdate({
          target: transcriptsCleanings.sessionId,
          set: {
            aiReadSegments: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(${transcriptsCleanings.aiReadSegments} || excluded.ai_read_segments) as x)`,
            anonymised: input.anonymised,
            lastRunId: input.runId,
            cleanedAt: input.at,
          },
        })
    })
  },

  markCleaned: async (input) => {
    await db
      .insert(transcriptsCleanings)
      .values({
        sessionId: input.sessionId,
        studyId: input.studyId,
        aiReadSegments: [],
        anonymised: input.anonymised,
        lastRunId: input.runId,
        cleanedAt: input.at,
      })
      .onConflictDoUpdate({
        target: transcriptsCleanings.sessionId,
        set: { anonymised: input.anonymised, lastRunId: input.runId, cleanedAt: input.at },
      })
  },

  suggestionsOf: async (sessionId) =>
    (
      await db
        .select()
        .from(transcriptsAiSuggestions)
        .where(eq(transcriptsAiSuggestions.sessionId, sessionId))
    ).map(({ runId: _, ...s }) => s),

  decisionsOf: async (sessionId) =>
    new Map(
      (
        await db
          .select()
          .from(transcriptsCorrectionDecisions)
          .where(eq(transcriptsCorrectionDecisions.sessionId, sessionId))
      ).map((r): [string, NameDecision] => [
        r.key,
        {
          status: r.status as NameDecision['status'],
          edited: r.edited,
          decidedBy: r.decidedBy,
          decidedAt: r.decidedAt,
        },
      ]),
    ),

  saveDecision: async (sessionId, key, decision) => {
    if (!decision) {
      await db
        .delete(transcriptsCorrectionDecisions)
        .where(
          and(
            eq(transcriptsCorrectionDecisions.sessionId, sessionId),
            eq(transcriptsCorrectionDecisions.key, key),
          ),
        )
      return
    }
    await db
      .insert(transcriptsCorrectionDecisions)
      .values({ sessionId, key, ...decision })
      .onConflictDoUpdate({
        target: [transcriptsCorrectionDecisions.sessionId, transcriptsCorrectionDecisions.key],
        set: decision,
      })
  },

  cleaningsOf: async (studyId) =>
    db.select().from(transcriptsCleanings).where(eq(transcriptsCleanings.studyId, studyId)),

  // The turns of each version are read only for the latest (review of PR #11).
  versionsOf: async (sessionId) =>
    db
      .select({
        sessionId: transcriptsCleanVersions.sessionId,
        number: transcriptsCleanVersions.number,
        rawImportedAt: transcriptsCleanVersions.rawImportedAt,
        anonymised: transcriptsCleanVersions.anonymised,
        fingerprint: transcriptsCleanVersions.fingerprint,
        createdBy: transcriptsCleanVersions.createdBy,
        createdAt: transcriptsCleanVersions.createdAt,
      })
      .from(transcriptsCleanVersions)
      .where(eq(transcriptsCleanVersions.sessionId, sessionId))
      .orderBy(desc(transcriptsCleanVersions.number)),

  latestVersion: async (sessionId) => {
    const [row] = await db
      .select()
      .from(transcriptsCleanVersions)
      .where(eq(transcriptsCleanVersions.sessionId, sessionId))
      .orderBy(desc(transcriptsCleanVersions.number))
      .limit(1)
    return row ?? null
  },

  latestVersions: async (studyId) => {
    const rows = await db
      .selectDistinctOn([transcriptsCleanVersions.sessionId], {
        sessionId: transcriptsCleanVersions.sessionId,
        number: transcriptsCleanVersions.number,
        rawImportedAt: transcriptsCleanVersions.rawImportedAt,
        anonymised: transcriptsCleanVersions.anonymised,
        fingerprint: transcriptsCleanVersions.fingerprint,
        createdBy: transcriptsCleanVersions.createdBy,
        createdAt: transcriptsCleanVersions.createdAt,
      })
      .from(transcriptsCleanVersions)
      .where(
        sql`${transcriptsCleanVersions.sessionId} in (select session_id from transcripts_transcripts where study_id = ${studyId})`,
      )
      .orderBy(transcriptsCleanVersions.sessionId, desc(transcriptsCleanVersions.number))
    return new Map(rows.map((r): [string, Omit<CleanVersion, 'segments'>] => [r.sessionId, r]))
  },

  addVersion: async (v) =>
    db.transaction(async (tx) => {
      // One validation at a time per interview: the next number is read under the lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`clean:${v.sessionId}`}))`)
      const [row] = await tx
        .select({ n: max(transcriptsCleanVersions.number) })
        .from(transcriptsCleanVersions)
        .where(eq(transcriptsCleanVersions.sessionId, v.sessionId))
      const number = (row?.n ?? 0) + 1
      await tx.insert(transcriptsCleanVersions).values({ ...v, segments: [...v.segments], number })
      return number
    }),

  publicationOf: async (sessionId) => {
    const [row] = await db
      .select()
      .from(transcriptsCleanPublications)
      .where(eq(transcriptsCleanPublications.sessionId, sessionId))
    return row ?? null
  },

  publicationsOf: async (studyId) => {
    const rows = await db
      .select()
      .from(transcriptsCleanPublications)
      .where(
        sql`${transcriptsCleanPublications.sessionId} in (select session_id from transcripts_transcripts where study_id = ${studyId})`,
      )
    return new Map(rows.map((r) => [r.sessionId, r]))
  },

  savePublication: async (p) => {
    await db
      .insert(transcriptsCleanPublications)
      .values(p)
      .onConflictDoUpdate({ target: transcriptsCleanPublications.sessionId, set: p })
  },

  folderOf: async (studyId) => {
    const [row] = await db
      .select()
      .from(transcriptsCleanFolders)
      .where(eq(transcriptsCleanFolders.studyId, studyId))
    return row ? { folderId: row.folderId, name: row.name } : null
  },

  saveFolder: async (studyId, folderId, name) => {
    await db
      .insert(transcriptsCleanFolders)
      .values({ studyId, folderId, name })
      .onConflictDoUpdate({ target: transcriptsCleanFolders.studyId, set: { folderId, name } })
  },

  createCleaningRun: async (run) => {
    try {
      await db.insert(transcriptsCorrectionRuns).values({
        id: run.id,
        studyId: run.studyId,
        teamId: run.teamId,
        startedBy: run.startedBy,
        mode: run.mode,
        stopRequested: run.stopRequested,
        startedAt: run.startedAt,
        ...runValues(run),
      })
      return true
    } catch (error) {
      if (isUniqueViolation(error)) return false
      throw error
    }
  },

  getCleaningRun: async (id) => {
    const [row] = await db
      .select()
      .from(transcriptsCorrectionRuns)
      .where(eq(transcriptsCorrectionRuns.id, id))
    return row ? toRun(row) : null
  },

  openCleaningRun: async (studyId) => {
    const [row] = await db
      .select()
      .from(transcriptsCorrectionRuns)
      .where(
        and(
          eq(transcriptsCorrectionRuns.studyId, studyId),
          isNull(transcriptsCorrectionRuns.finishedAt),
        ),
      )
    return row ? toRun(row) : null
  },

  // `stopRequested` is written only by `requestCleaningStop`.
  saveCleaningRun: async (run) => {
    await db
      .update(transcriptsCorrectionRuns)
      .set(runValues(run))
      .where(
        and(eq(transcriptsCorrectionRuns.id, run.id), isNull(transcriptsCorrectionRuns.finishedAt)),
      )
  },

  cleaningHeartbeat: async (runId, at) => {
    await db
      .update(transcriptsCorrectionRuns)
      .set({ heartbeatAt: at })
      .where(eq(transcriptsCorrectionRuns.id, runId))
  },

  cleaningStopRequested: async (runId) => {
    const [row] = await db
      .select({
        stop: transcriptsCorrectionRuns.stopRequested,
        finishedAt: transcriptsCorrectionRuns.finishedAt,
      })
      .from(transcriptsCorrectionRuns)
      .where(eq(transcriptsCorrectionRuns.id, runId))
    return !row || row.stop || row.finishedAt !== null
  },

  requestCleaningStop: async (runId) => {
    await db
      .update(transcriptsCorrectionRuns)
      .set({ stopRequested: true })
      .where(eq(transcriptsCorrectionRuns.id, runId))
  },

  cleaningRunsOf: async (studyId) =>
    (
      await db
        .select()
        .from(transcriptsCorrectionRuns)
        .where(eq(transcriptsCorrectionRuns.studyId, studyId))
        .orderBy(desc(transcriptsCorrectionRuns.startedAt), desc(transcriptsCorrectionRuns.id))
    ).map(toRun),
})
