import { and, desc, eq, inArray, lt, notExists, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { AnalysisRun, UsabilityStore } from '../application/ports.ts'
import type { AnalysisFailure, SessionAnalysis, Stage } from '../domain/analysis.ts'
import { mergeAnalyses, type Observation } from '../domain/observation.ts'
import type { TaskResult } from '../domain/task-result.ts'
import {
  usabilityAnalyses,
  usabilityAnalysisRuns,
  usabilityObservations,
  usabilityScreenshots,
  usabilityTaskResults,
  usabilityTranscripts,
} from './schema.ts'

type AnalysisRow = typeof usabilityAnalyses.$inferSelect
type ObservationRow = typeof usabilityObservations.$inferSelect
type TaskRow = typeof usabilityTaskResults.$inferSelect
type RunRow = typeof usabilityAnalysisRuns.$inferSelect

const toAnalysis = (r: AnalysisRow): SessionAnalysis => ({
  ...r,
  state: r.state as SessionAnalysis['state'],
  stage: r.stage as Stage | null,
  failure: r.failure as AnalysisFailure | null,
})

const toObservation = (r: ObservationRow): Observation => ({
  ...r,
  kind: r.kind as Observation['kind'],
  judge: r.judge as Observation['judge'],
  arbiter: r.arbiter as Observation['arbiter'],
  origin: r.origin as Observation['origin'],
  status: r.status as Observation['status'],
})

const toTask = (r: TaskRow): TaskResult => ({
  ...r,
  outcome: r.outcome as TaskResult['outcome'],
  status: r.status as TaskResult['status'],
})

const toRun = (r: RunRow): AnalysisRun => ({ ...r, state: r.state as AnalysisRun['state'] })

const observationValues = (o: Observation) => {
  const { id: _id, version: _v, ...rest } = o
  return rest
}

/** The module's tables (spec 038); one transaction per write that touches several rows. */
export const createUsabilityStore = (db: Db): UsabilityStore => ({
  analysisOf: async (sessionId) => {
    const [row] = await db
      .select()
      .from(usabilityAnalyses)
      .where(eq(usabilityAnalyses.sessionId, sessionId))
    return row ? toAnalysis(row) : null
  },

  analysesOf: async (studyId) =>
    (await db.select().from(usabilityAnalyses).where(eq(usabilityAnalyses.studyId, studyId))).map(
      toAnalysis,
    ),

  analysedStudies: async () =>
    (
      await db
        .selectDistinct({ studyId: usabilityAnalyses.studyId })
        .from(usabilityAnalyses)
        .where(eq(usabilityAnalyses.state, 'done'))
    ).map((r) => r.studyId),

  analysisById: async (id) => {
    const [row] = await db.select().from(usabilityAnalyses).where(eq(usabilityAnalyses.id, id))
    return row ? toAnalysis(row) : null
  },

  beginAnalysis: async (a) => {
    // One analysis per session: a new one takes the place of the previous, keeping its id so
    // the decided observations stay attached (FR-010).
    await db
      .insert(usabilityAnalyses)
      .values({ ...a })
      .onConflictDoUpdate({
        target: usabilityAnalyses.sessionId,
        set: {
          protocolVersion: a.protocolVersion,
          videoFileId: a.videoFileId,
          videoModifiedAt: a.videoModifiedAt,
          videoSize: a.videoSize,
          state: a.state,
          stage: null,
          failure: null,
          runId: a.runId,
          startedBy: a.startedBy,
          startedAt: a.startedAt,
          finishedAt: null,
          version: sql`${usabilityAnalyses.version} + 1`,
        },
      })
  },

  restoreAnalysis: async (a) => {
    const { id, sessionId: _session, studyId: _study, ...fields } = a
    await db.update(usabilityAnalyses).set(fields).where(eq(usabilityAnalyses.id, id))
  },

  setStage: async (id, stage) => {
    await db
      .update(usabilityAnalyses)
      .set({ state: 'analysing', stage })
      .where(eq(usabilityAnalyses.id, id))
  },

  failAnalysis: async (id, failure, now) => {
    await db
      .update(usabilityAnalyses)
      .set({ state: failure === 'STOPPED' ? 'stopped' : 'failed', failure, finishedAt: now })
      .where(eq(usabilityAnalyses.id, id))
  },

  completeAnalysis: async (id, out, now) => {
    await db.transaction(async (tx) => {
      const [analysis] = await tx
        .select()
        .from(usabilityAnalyses)
        .where(eq(usabilityAnalyses.id, id))
      if (!analysis) return
      const previous = (
        await tx
          .select()
          .from(usabilityObservations)
          .where(eq(usabilityObservations.analysisId, id))
      ).map(toObservation)
      const { add } = mergeAnalyses(previous, out.observations)
      await tx
        .delete(usabilityObservations)
        .where(
          and(
            eq(usabilityObservations.analysisId, id),
            eq(usabilityObservations.status, 'proposed'),
          ),
        )
      if (add.length)
        await tx
          .insert(usabilityObservations)
          .values(add.map((o) => ({ ...observationValues(o), id: o.id, version: o.version })))
      const decided = (
        await tx.select().from(usabilityTaskResults).where(eq(usabilityTaskResults.analysisId, id))
      ).filter((t) => t.status !== 'proposed')
      await tx
        .delete(usabilityTaskResults)
        .where(
          and(eq(usabilityTaskResults.analysisId, id), eq(usabilityTaskResults.status, 'proposed')),
        )
      const fresh = out.tasks.filter((t) => !decided.some((d) => d.taskId === t.taskId))
      if (fresh.length) await tx.insert(usabilityTaskResults).values(fresh.map((t) => ({ ...t })))
      await tx
        .insert(usabilityTranscripts)
        .values({ analysisId: id, language: out.language, segments: [...out.segments] })
        .onConflictDoUpdate({
          target: usabilityTranscripts.analysisId,
          set: { language: out.language, segments: [...out.segments] },
        })
      await tx
        .update(usabilityAnalyses)
        .set({ state: 'done', stage: null, failure: null, finishedAt: now })
        .where(eq(usabilityAnalyses.id, id))
    })
  },

  transcriptOf: async (id) => {
    const [row] = await db
      .select()
      .from(usabilityTranscripts)
      .where(eq(usabilityTranscripts.analysisId, id))
    return row ? { language: row.language, segments: row.segments } : null
  },

  taskResultsOf: async (ids) =>
    ids.length
      ? (
          await db
            .select()
            .from(usabilityTaskResults)
            .where(inArray(usabilityTaskResults.analysisId, [...ids]))
        ).map(toTask)
      : [],

  toReviewCounts: async (ids) => {
    const counts = new Map<string, number>()
    if (!ids.length) return counts
    const [observations, tasks] = await Promise.all([
      db
        .select({ id: usabilityObservations.analysisId, n: sql<number>`count(*)::int` })
        .from(usabilityObservations)
        .where(
          and(
            inArray(usabilityObservations.analysisId, [...ids]),
            eq(usabilityObservations.status, 'proposed'),
          ),
        )
        .groupBy(usabilityObservations.analysisId),
      db
        .select({ id: usabilityTaskResults.analysisId, n: sql<number>`count(*)::int` })
        .from(usabilityTaskResults)
        .where(
          and(
            inArray(usabilityTaskResults.analysisId, [...ids]),
            eq(usabilityTaskResults.status, 'proposed'),
          ),
        )
        .groupBy(usabilityTaskResults.analysisId),
    ])
    for (const r of [...observations, ...tasks]) counts.set(r.id, (counts.get(r.id) ?? 0) + r.n)
    return counts
  },

  observationsOf: async (ids) =>
    ids.length
      ? (
          await db
            .select()
            .from(usabilityObservations)
            .where(inArray(usabilityObservations.analysisId, [...ids]))
        ).map(toObservation)
      : [],

  observation: async (id) => {
    const [row] = await db
      .select()
      .from(usabilityObservations)
      .where(eq(usabilityObservations.id, id))
    return row ? toObservation(row) : null
  },

  taskResult: async (id) => {
    const [row] = await db
      .select()
      .from(usabilityTaskResults)
      .where(eq(usabilityTaskResults.id, id))
    return row ? toTask(row) : null
  },

  saveObservation: async (o, expected) => {
    const rows = await db
      .update(usabilityObservations)
      .set({ ...observationValues(o), version: expected + 1 })
      .where(and(eq(usabilityObservations.id, o.id), eq(usabilityObservations.version, expected)))
      .returning({ id: usabilityObservations.id })
    return rows.length ? 'saved' : 'stale'
  },

  addObservation: async (o) => {
    await db
      .insert(usabilityObservations)
      .values({ ...observationValues(o), id: o.id, version: o.version })
  },

  saveTaskResult: async (r, expected) => {
    const { id: _id, version: _v, ...rest } = r
    const rows = await db
      .update(usabilityTaskResults)
      .set({ ...rest, version: expected + 1 })
      .where(and(eq(usabilityTaskResults.id, r.id), eq(usabilityTaskResults.version, expected)))
      .returning({ id: usabilityTaskResults.id })
    return rows.length ? 'saved' : 'stale'
  },

  startRun: async (run) => {
    // A run without heartbeat for 10 minutes is replaced (as Ingestion's analysis runs).
    return db.transaction(async (tx) => {
      await tx
        .update(usabilityAnalysisRuns)
        .set({ state: 'stopped', finishedAt: run.startedAt })
        .where(
          and(
            eq(usabilityAnalysisRuns.studyId, run.studyId),
            eq(usabilityAnalysisRuns.state, 'running'),
            sql`${usabilityAnalysisRuns.heartbeatAt} < ${new Date(run.startedAt.getTime() - 10 * 60_000)}`,
          ),
        )
      const rows = await tx
        .insert(usabilityAnalysisRuns)
        .values({ ...run, sessionIds: [...run.sessionIds] })
        .onConflictDoNothing()
        .returning({ id: usabilityAnalysisRuns.id })
      return rows.length > 0
    })
  },

  lastRun: async (studyId) => {
    const [row] = await db
      .select()
      .from(usabilityAnalysisRuns)
      .where(eq(usabilityAnalysisRuns.studyId, studyId))
      .orderBy(desc(usabilityAnalysisRuns.startedAt))
      .limit(1)
    return row ? toRun(row) : null
  },

  getRun: async (id) => {
    const [row] = await db
      .select()
      .from(usabilityAnalysisRuns)
      .where(eq(usabilityAnalysisRuns.id, id))
    return row ? toRun(row) : null
  },

  heartbeat: async (id, now) => {
    await db
      .update(usabilityAnalysisRuns)
      .set({ heartbeatAt: now })
      .where(eq(usabilityAnalysisRuns.id, id))
  },

  requestStop: async (id) => {
    await db
      .update(usabilityAnalysisRuns)
      .set({ stopRequested: true })
      .where(eq(usabilityAnalysisRuns.id, id))
  },

  finishRun: async (id, state, now) => {
    await db
      .update(usabilityAnalysisRuns)
      .set({ state, finishedAt: now })
      .where(and(eq(usabilityAnalysisRuns.id, id), eq(usabilityAnalysisRuns.state, 'running')))
  },

  registerScreenshot: async (key, studyId, now) => {
    await db
      .insert(usabilityScreenshots)
      .values({ key, studyId, createdAt: now })
      .onConflictDoNothing()
  },

  orphanScreenshots: async (registeredBefore) => {
    const rows = await db
      .delete(usabilityScreenshots)
      .where(
        and(
          lt(usabilityScreenshots.createdAt, registeredBefore),
          notExists(
            db
              .select({ one: sql`1` })
              .from(usabilityObservations)
              .where(eq(usabilityObservations.screenshotKey, usabilityScreenshots.key)),
          ),
        ),
      )
      .returning({ key: usabilityScreenshots.key })
    return rows.map((r) => r.key)
  },
})
