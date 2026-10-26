import { fold } from '@goodresearch/shared'
import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { SaveOutcome, TranscriptsStore } from '../application/ports.ts'
import type { TermCategory, TermKind } from '../domain/answer-check.ts'
import type { TermLanguage } from '../domain/candidates.ts'
import type { LexiconFailure, LexiconRun, RunPhase, Transcript } from '../domain/lexicon-run.ts'
import type { LexiconTerm, TermScope, TermStatus } from '../domain/lexicon-term.ts'
import {
  transcriptsConsents,
  transcriptsLexiconRuns,
  transcriptsLexiconTerms,
  transcriptsOccurrences,
  transcriptsTranscripts,
  transcriptsVerdicts,
} from './schema.ts'

type TermRow = typeof transcriptsLexiconTerms.$inferSelect
type RunRow = typeof transcriptsLexiconRuns.$inferSelect
type TranscriptRow = typeof transcriptsTranscripts.$inferSelect

const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause)
    if ((e as { code?: string }).code === '23505') return true
  return false
}

const toTranscript = (r: TranscriptRow): Transcript => ({
  ...r,
  language: r.language as TermLanguage,
  fileModifiedAt: r.fileModifiedAt ? r.fileModifiedAt.toISOString() : null,
})

const toTerm = (r: TermRow): LexiconTerm => ({
  id: r.id,
  teamId: r.teamId,
  language: r.language as TermLanguage,
  form: r.form,
  kind: r.kind as TermKind,
  correction: r.correction,
  category: r.category as TermCategory,
  definition: r.definition,
  scope: r.scope as TermScope,
  scopeDecided: r.scopeDecided,
  status: r.status as TermStatus,
  mergedInto: r.mergedInto,
  origin: r.origin as LexiconTerm['origin'],
  quote: r.quote,
  variants: r.variants,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
})

const termValues = (t: LexiconTerm) => ({
  teamId: t.teamId,
  language: t.language,
  form: t.form,
  foldedForm: fold(t.form),
  kind: t.kind,
  correction: t.correction,
  category: t.category,
  definition: t.definition,
  scope: t.scope,
  scopeDecided: t.scopeDecided,
  status: t.status,
  mergedInto: t.mergedInto,
  origin: t.origin,
  quote: t.quote,
  variants: [...t.variants],
  decidedBy: t.decidedBy,
  decidedAt: t.decidedAt,
  version: t.version,
  updatedAt: t.updatedAt,
})

const toRun = (r: RunRow): LexiconRun => ({
  ...r,
  phase: r.phase as RunPhase,
  failure: r.failure as LexiconFailure | null,
  sessions: r.sessions.map((s) => ({
    sessionId: s.sessionId,
    state: s.state,
    ...(s.failure ? { failure: s.failure as LexiconFailure } : {}),
  })),
})

const runValues = (r: LexiconRun) => ({
  sessions: r.sessions.map((s) => ({ ...s })),
  phase: r.phase,
  leftOut: r.leftOut,
  failure: r.failure,
  heartbeatAt: r.heartbeatAt,
  finishedAt: r.finishedAt,
})

/** The transcripts module's tables (spec 010 data model). */
export const createTranscriptsStore = (db: Db): TranscriptsStore => {
  const writeTerm = async (
    executor: Pick<Db, 'update'>,
    t: LexiconTerm,
    expected: number,
  ): Promise<SaveOutcome> => {
    const rows = await executor
      .update(transcriptsLexiconTerms)
      .set(termValues(t))
      .where(
        and(eq(transcriptsLexiconTerms.id, t.id), eq(transcriptsLexiconTerms.version, expected)),
      )
      .returning({ id: transcriptsLexiconTerms.id })
    return rows.length ? 'ok' : 'stale'
  }

  return {
    transcriptsOf: async (studyId) =>
      (
        await db
          .select()
          .from(transcriptsTranscripts)
          .where(eq(transcriptsTranscripts.studyId, studyId))
      ).map(toTranscript),

    getTranscript: async (sessionId) => {
      const [row] = await db
        .select()
        .from(transcriptsTranscripts)
        .where(eq(transcriptsTranscripts.sessionId, sessionId))
      return row ? toTranscript(row) : null
    },

    saveTranscript: async (t) => {
      const values = {
        studyId: t.studyId,
        fileId: t.fileId,
        fileModifiedAt: t.fileModifiedAt ? new Date(t.fileModifiedAt) : null,
        language: t.language,
        segments: [...t.segments],
        importedBy: t.importedBy,
        importedAt: t.importedAt,
        readAt: t.readAt,
      }
      await db
        .insert(transcriptsTranscripts)
        .values({ sessionId: t.sessionId, ...values })
        .onConflictDoUpdate({ target: transcriptsTranscripts.sessionId, set: values })
    },

    markRead: async (sessionIds, at) => {
      if (sessionIds.length === 0) return
      await db
        .update(transcriptsTranscripts)
        .set({ readAt: at })
        .where(inArray(transcriptsTranscripts.sessionId, [...sessionIds]))
    },

    teamTerms: async (teamId) =>
      (
        await db
          .select()
          .from(transcriptsLexiconTerms)
          .where(eq(transcriptsLexiconTerms.teamId, teamId))
          .orderBy(transcriptsLexiconTerms.createdAt)
      ).map(toTerm),

    getTerm: async (id) => {
      const [row] = await db
        .select()
        .from(transcriptsLexiconTerms)
        .where(eq(transcriptsLexiconTerms.id, id))
      return row ? toTerm(row) : null
    },

    insertTerm: async (t) => {
      try {
        await db
          .insert(transcriptsLexiconTerms)
          .values({ id: t.id, createdAt: t.createdAt, ...termValues(t) })
        return 'ok'
      } catch (error) {
        if (isUniqueViolation(error)) return 'exists'
        throw error
      }
    },

    saveTerm: async (t, expected) => {
      try {
        return await writeTerm(db, t, expected)
      } catch (error) {
        if (isUniqueViolation(error)) return 'exists'
        throw error
      }
    },

    saveMerge: async (from, fromExpected, into, intoExpected) => {
      try {
        return await db.transaction(async (tx) => {
          // The merged term leaves the unique form first, then the kept one takes its spellings.
          if ((await writeTerm(tx, from, fromExpected)) !== 'ok') {
            tx.rollback()
          }
          if ((await writeTerm(tx, into, intoExpected)) !== 'ok') {
            tx.rollback()
          }
          // The verdicts follow the spellings; a place the kept term already judged keeps its own.
          await tx.execute(sql`
            insert into transcripts_verdicts
              (term_id, session_id, study_id, segment_id, "offset", verdict, decided_by, decided_at)
            select ${into.id}, session_id, study_id, segment_id, "offset", verdict, decided_by, decided_at
            from transcripts_verdicts where term_id = ${from.id}
            on conflict do nothing`)
          await tx.delete(transcriptsVerdicts).where(eq(transcriptsVerdicts.termId, from.id))
          // So do the occurrences, in every study of the team (no reading needed to see them).
          await tx.execute(sql`
            insert into transcripts_occurrences
              (term_id, spelling, session_id, study_id, count, anchors)
            select ${into.id}, spelling, session_id, study_id, count, anchors
            from transcripts_occurrences where term_id = ${from.id}
            on conflict do nothing`)
          await tx.delete(transcriptsOccurrences).where(eq(transcriptsOccurrences.termId, from.id))
          return 'ok' as const
        })
      } catch (error) {
        if (isUniqueViolation(error)) return 'exists'
        if (error instanceof Error && error.name === 'TransactionRollbackError') return 'stale'
        throw error
      }
    },

    replaceOccurrences: async (studyId, rows) => {
      await db.transaction(async (tx) => {
        await tx.delete(transcriptsOccurrences).where(eq(transcriptsOccurrences.studyId, studyId))
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500)
          if (chunk.length)
            await tx.insert(transcriptsOccurrences).values(
              chunk.map((o) => ({
                termId: o.termId,
                spelling: o.spelling,
                sessionId: o.sessionId,
                studyId,
                count: o.count,
                anchors: [...o.anchors],
              })),
            )
        }
      })
    },

    verdictsOf: async (studyId) =>
      (
        await db.select().from(transcriptsVerdicts).where(eq(transcriptsVerdicts.studyId, studyId))
      ).map((r) => ({ ...r, verdict: r.verdict as 'yes' | 'no' })),

    saveVerdict: async (place, verdict) => {
      const where = and(
        eq(transcriptsVerdicts.termId, place.termId),
        eq(transcriptsVerdicts.segmentId, place.segmentId),
        eq(transcriptsVerdicts.offset, place.offset),
      )
      if (!verdict) {
        await db.delete(transcriptsVerdicts).where(where)
        return
      }
      await db
        .insert(transcriptsVerdicts)
        .values({ ...place, ...verdict })
        .onConflictDoUpdate({
          target: [
            transcriptsVerdicts.termId,
            transcriptsVerdicts.segmentId,
            transcriptsVerdicts.offset,
          ],
          set: verdict,
        })
    },

    occurrencesOf: async (studyId) =>
      db
        .select({
          termId: transcriptsOccurrences.termId,
          spelling: transcriptsOccurrences.spelling,
          sessionId: transcriptsOccurrences.sessionId,
          count: transcriptsOccurrences.count,
          anchors: transcriptsOccurrences.anchors,
        })
        .from(transcriptsOccurrences)
        .where(eq(transcriptsOccurrences.studyId, studyId)),

    otherStudies: async (termIds, studyId) => {
      if (termIds.length === 0) return new Map()
      const rows = await db
        .select({
          termId: transcriptsOccurrences.termId,
          studies: sql<number>`count(distinct ${transcriptsOccurrences.studyId})::int`,
        })
        .from(transcriptsOccurrences)
        .where(
          and(
            inArray(transcriptsOccurrences.termId, [...termIds]),
            ne(transcriptsOccurrences.studyId, studyId),
          ),
        )
        .groupBy(transcriptsOccurrences.termId)
      return new Map(rows.map((r) => [r.termId, r.studies]))
    },

    createRun: async (run) => {
      try {
        await db.insert(transcriptsLexiconRuns).values({
          id: run.id,
          studyId: run.studyId,
          teamId: run.teamId,
          startedBy: run.startedBy,
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

    getRun: async (id) => {
      const [row] = await db
        .select()
        .from(transcriptsLexiconRuns)
        .where(eq(transcriptsLexiconRuns.id, id))
      return row ? toRun(row) : null
    },

    openRun: async (studyId) => {
      const [row] = await db
        .select()
        .from(transcriptsLexiconRuns)
        .where(
          and(
            eq(transcriptsLexiconRuns.studyId, studyId),
            isNull(transcriptsLexiconRuns.finishedAt),
          ),
        )
      return row ? toRun(row) : null
    },

    // `stopRequested` is written only by `requestStop`: a run saving its progress never clears it.
    saveRun: async (run) => {
      await db
        .update(transcriptsLexiconRuns)
        .set(runValues(run))
        .where(
          and(eq(transcriptsLexiconRuns.id, run.id), isNull(transcriptsLexiconRuns.finishedAt)),
        )
    },

    heartbeat: async (runId, at) => {
      await db
        .update(transcriptsLexiconRuns)
        .set({ heartbeatAt: at })
        .where(eq(transcriptsLexiconRuns.id, runId))
    },

    stopRequested: async (runId) => {
      const [row] = await db
        .select({
          stop: transcriptsLexiconRuns.stopRequested,
          finishedAt: transcriptsLexiconRuns.finishedAt,
        })
        .from(transcriptsLexiconRuns)
        .where(eq(transcriptsLexiconRuns.id, runId))
      return !row || row.stop || row.finishedAt !== null
    },

    requestStop: async (runId) => {
      await db
        .update(transcriptsLexiconRuns)
        .set({ stopRequested: true })
        .where(eq(transcriptsLexiconRuns.id, runId))
    },

    runsOf: async (studyId) =>
      (
        await db
          .select()
          .from(transcriptsLexiconRuns)
          .where(eq(transcriptsLexiconRuns.studyId, studyId))
          .orderBy(desc(transcriptsLexiconRuns.startedAt), desc(transcriptsLexiconRuns.id))
      ).map(toRun),

    accountNames: async (ids) => {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const rows = await db
        .select({ id: auth_users.id, name: auth_users.name, status: auth_users.status })
        .from(auth_users)
        .where(inArray(auth_users.id, unique))
      return new Map(rows.filter((r) => r.status !== 'deleted').map((r) => [r.id, r.name]))
    },

    hasConsent: async (accountId, studyId, provider) => {
      const [row] = await db
        .select({ n: count() })
        .from(transcriptsConsents)
        .where(
          and(
            eq(transcriptsConsents.accountId, accountId),
            eq(transcriptsConsents.studyId, studyId),
            eq(transcriptsConsents.provider, provider),
          ),
        )
      return (row?.n ?? 0) > 0
    },

    giveConsent: async (accountId, studyId, provider, at) => {
      await db
        .insert(transcriptsConsents)
        .values({ accountId, studyId, provider, givenAt: at })
        .onConflictDoNothing()
    },
  }
}
