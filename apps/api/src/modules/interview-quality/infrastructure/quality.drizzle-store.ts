import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type {
  Evaluation,
  QualityStore,
  StoredReformulation,
  StoredRemark,
  TextAnalysed,
} from '../application/ports.ts'
import type { RemarkKind, Stance } from '../domain/figures.ts'
import type { ReviewFailure, ReviewRun } from '../domain/review-run.ts'
import {
  qualityConsents,
  qualityEvaluations,
  qualityReformulations,
  qualityRemarks,
  qualityRuns,
  qualitySpeakerCounts,
} from './schema.ts'

type StoredSessions = (typeof qualityRuns.$inferInsert)['sessions']

const runOf = (r: typeof qualityRuns.$inferSelect): ReviewRun => ({
  ...r,
  sessions: r.sessions.map((s) => ({
    ...s,
    ...(s.failure ? { failure: s.failure as ReviewFailure } : {}),
  })) as ReviewRun['sessions'],
  failure: r.failure as ReviewFailure | null,
})

const evaluationOf = (r: typeof qualityEvaluations.$inferSelect): Evaluation => ({
  ...r,
  textAnalysed: r.textAnalysed as TextAnalysed,
})

const remarkOf = (r: typeof qualityRemarks.$inferSelect): StoredRemark => ({
  id: r.id,
  sessionId: r.sessionId,
  studyId: r.studyId,
  runId: r.runId,
  segmentId: r.segmentId,
  offset: r.offset,
  length: r.length,
  text: r.text,
  speakerLabel: r.speakerLabel,
  kind: r.kind as RemarkKind,
  reason: r.reasonEn !== null && r.reasonFr !== null ? { en: r.reasonEn, fr: r.reasonFr } : null,
  reasonPerson: r.reasonPerson,
  recommendation: r.recommendation,
  addedElement: r.addedElement,
  origin: r.origin as StoredRemark['origin'],
  stance: r.stance as Stance | null,
  stanceBy: r.stanceBy,
  stanceAt: r.stanceAt,
  version: r.version,
})

const remarkRow = (r: StoredRemark) => ({
  id: r.id,
  sessionId: r.sessionId,
  studyId: r.studyId,
  runId: r.runId,
  segmentId: r.segmentId,
  offset: r.offset,
  length: r.length,
  text: r.text,
  speakerLabel: r.speakerLabel,
  kind: r.kind,
  reasonEn: r.reason?.en ?? null,
  reasonFr: r.reason?.fr ?? null,
  reasonPerson: r.reasonPerson,
  recommendation: r.recommendation,
  addedElement: r.addedElement,
  origin: r.origin,
  stance: r.stance,
  stanceBy: r.stanceBy,
  stanceAt: r.stanceAt,
  version: r.version,
})

const reformulationOf = (r: typeof qualityReformulations.$inferSelect): StoredReformulation => r

export const createQualityStore = (db: Db): QualityStore => ({
  openRun: async (studyId) => {
    const [row] = await db
      .select()
      .from(qualityRuns)
      .where(and(eq(qualityRuns.studyId, studyId), isNull(qualityRuns.finishedAt)))
    return row ? runOf(row) : null
  },
  runsOf: async (studyId) =>
    (
      await db
        .select()
        .from(qualityRuns)
        .where(eq(qualityRuns.studyId, studyId))
        .orderBy(desc(qualityRuns.startedAt))
    ).map(runOf),
  getRun: async (id) => {
    const [row] = await db.select().from(qualityRuns).where(eq(qualityRuns.id, id))
    return row ? runOf(row) : null
  },
  startRun: async (run) => {
    const rows = await db
      .insert(qualityRuns)
      .values({ ...run, sessions: run.sessions as StoredSessions })
      .onConflictDoNothing()
      .returning({ id: qualityRuns.id })
    return rows.length > 0
  },
  // Never `stopRequested`: a stop asked while the worker was reading stays asked.
  saveRun: async (run) => {
    await db
      .update(qualityRuns)
      .set({
        sessions: run.sessions as StoredSessions,
        leftOut: run.leftOut,
        failure: run.failure,
        heartbeatAt: run.heartbeatAt,
        finishedAt: run.finishedAt,
      })
      .where(and(eq(qualityRuns.id, run.id), isNull(qualityRuns.finishedAt)))
  },
  requestStop: async (runId) => {
    await db.update(qualityRuns).set({ stopRequested: sql`true` }).where(eq(qualityRuns.id, runId))
  },

  evaluationsOf: async (studyId) =>
    (await db.select().from(qualityEvaluations).where(eq(qualityEvaluations.studyId, studyId))).map(
      evaluationOf,
    ),
  speakerCountsOf: async (studyId) =>
    db.select().from(qualitySpeakerCounts).where(eq(qualitySpeakerCounts.studyId, studyId)),
  reformulationsOf: async (studyId) =>
    (
      await db
        .select()
        .from(qualityReformulations)
        .where(eq(qualityReformulations.studyId, studyId))
    ).map(reformulationOf),
  remarksOf: async (studyId) =>
    (await db.select().from(qualityRemarks).where(eq(qualityRemarks.studyId, studyId))).map(
      remarkOf,
    ),
  getRemark: async (id) => {
    const [row] = await db.select().from(qualityRemarks).where(eq(qualityRemarks.id, id))
    return row ? remarkOf(row) : null
  },
  getReformulation: async (id) => {
    const [row] = await db
      .select()
      .from(qualityReformulations)
      .where(eq(qualityReformulations.id, id))
    return row ? reformulationOf(row) : null
  },
  saveStance: async (remark, expectedVersion) => {
    const rows = await db
      .update(qualityRemarks)
      .set({
        stance: remark.stance,
        stanceBy: remark.stanceBy,
        stanceAt: remark.stanceAt,
        version: remark.version,
      })
      .where(and(eq(qualityRemarks.id, remark.id), eq(qualityRemarks.version, expectedVersion)))
      .returning({ id: qualityRemarks.id })
    return rows.length > 0
  },
  requalify: async (remark, reformulationId) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .update(qualityReformulations)
        .set({ requalifiedRemarkId: remark.id })
        .where(
          and(
            eq(qualityReformulations.id, reformulationId),
            isNull(qualityReformulations.requalifiedRemarkId),
          ),
        )
        .returning({ id: qualityReformulations.id })
      if (rows.length === 0) return false
      await tx.insert(qualityRemarks).values(remarkRow(remark))
      return true
    }),
  withdrawRemark: async (remarkId, expectedVersion) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .delete(qualityRemarks)
        .where(and(eq(qualityRemarks.id, remarkId), eq(qualityRemarks.version, expectedVersion)))
        .returning({ id: qualityRemarks.id })
      if (rows.length === 0) return false
      await tx
        .update(qualityReformulations)
        .set({ requalifiedRemarkId: null })
        .where(eq(qualityReformulations.requalifiedRemarkId, remarkId))
      return true
    }),
  replaceReview: async (input) => {
    const { sessionId } = input.evaluation
    await db.transaction(async (tx) => {
      await tx.delete(qualitySpeakerCounts).where(eq(qualitySpeakerCounts.sessionId, sessionId))
      await tx
        .delete(qualityReformulations)
        .where(
          and(
            eq(qualityReformulations.sessionId, sessionId),
            isNull(qualityReformulations.requalifiedRemarkId),
          ),
        )
      await tx
        .delete(qualityRemarks)
        .where(
          and(
            eq(qualityRemarks.sessionId, sessionId),
            eq(qualityRemarks.origin, 'ai'),
            isNull(qualityRemarks.stance),
          ),
        )
      if (input.counts.length > 0) await tx.insert(qualitySpeakerCounts).values([...input.counts])
      if (input.reformulations.length > 0)
        await tx.insert(qualityReformulations).values([...input.reformulations])
      if (input.remarks.length > 0)
        await tx.insert(qualityRemarks).values(input.remarks.map(remarkRow))
      await tx
        .insert(qualityEvaluations)
        .values(input.evaluation)
        .onConflictDoUpdate({ target: qualityEvaluations.sessionId, set: input.evaluation })
    })
  },

  hasConsent: async (accountId, studyId, provider) => {
    const [row] = await db
      .select()
      .from(qualityConsents)
      .where(
        and(
          eq(qualityConsents.accountId, accountId),
          eq(qualityConsents.studyId, studyId),
          eq(qualityConsents.provider, provider),
        ),
      )
    return row !== undefined
  },
  giveConsent: async (accountId, studyId, provider, at) => {
    await db
      .insert(qualityConsents)
      .values({ accountId, studyId, provider, givenAt: at })
      .onConflictDoUpdate({
        target: [qualityConsents.accountId, qualityConsents.studyId],
        set: { provider, givenAt: at },
      })
  },
})
