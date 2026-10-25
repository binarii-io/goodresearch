import { ConcurrencyError } from '@goodresearch/shared'
import { and, count, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import { type GuideContent, type GuideOrigin, InterviewGuide } from '../domain/interview-guide.ts'
import { PlannedInterview, type PlannedInterviewStatus } from '../domain/planned-interview.ts'
import type {
  InterviewGuideRepository,
  PlannedInterviewRepository,
} from '../domain/preparation.repository.ts'
import { researchInterviewGuides, researchPlannedInterviews, researchStudies } from './schema.ts'

export const drizzleGuideRepository = (tx: Executor): InterviewGuideRepository => ({
  findByStudy: async (studyId) => {
    const [row] = await tx
      .select()
      .from(researchInterviewGuides)
      .where(eq(researchInterviewGuides.studyId, studyId))
    return row
      ? InterviewGuide.fromPersistence({
          ...row,
          content: row.content as GuideContent,
          origin: row.origin as GuideOrigin,
        })
      : null
  },

  insert: async (guide) => {
    const inserted = await tx
      .insert(researchInterviewGuides)
      .values({ ...guide.snapshot(), version: 0 })
      .onConflictDoNothing({ target: researchInterviewGuides.studyId })
      .returning({ id: researchInterviewGuides.studyId })
    if (inserted.length === 0) throw new ConcurrencyError()
  },

  update: async (guide) => {
    const p = guide.snapshot()
    const updated = await tx
      .update(researchInterviewGuides)
      .set({
        content: p.content,
        origin: p.origin,
        updatedBy: p.updatedBy,
        updatedAt: p.updatedAt,
        version: sql`${researchInterviewGuides.version} + 1`,
      })
      .where(
        and(
          eq(researchInterviewGuides.studyId, p.studyId),
          eq(researchInterviewGuides.version, p.version),
        ),
      )
      .returning({ id: researchInterviewGuides.studyId })
    if (updated.length === 0) throw new ConcurrencyError()
  },
})

export const drizzlePlannedInterviewRepository = (tx: Executor): PlannedInterviewRepository => ({
  findById: async (id) => {
    const [row] = await tx
      .select()
      .from(researchPlannedInterviews)
      .where(eq(researchPlannedInterviews.id, id))
    return row
      ? PlannedInterview.fromPersistence({
          ...row,
          status: row.status as PlannedInterviewStatus,
        })
      : null
  },

  insertIfRoom: (planned, limit) =>
    tx.transaction(async (t) => {
      const p = planned.snapshot()
      // The study row is the lock: concurrent additions to one schedule run one after the other.
      await t.execute(
        sql`select 1 from ${researchStudies} where ${researchStudies.id} = ${p.studyId} for update`,
      )
      const [row] = await t
        .select({ n: count() })
        .from(researchPlannedInterviews)
        .where(eq(researchPlannedInterviews.studyId, p.studyId))
      if ((row?.n ?? 0) >= limit) return false
      await t.insert(researchPlannedInterviews).values({ ...p, version: 0 })
      return true
    }),

  update: async (planned) => {
    const { id, studyId, createdBy, createdAt, version, ...fields } = planned.snapshot()
    const updated = await tx
      .update(researchPlannedInterviews)
      .set({ ...fields, version: sql`${researchPlannedInterviews.version} + 1` })
      .where(
        and(eq(researchPlannedInterviews.id, id), eq(researchPlannedInterviews.version, version)),
      )
      .returning({ id: researchPlannedInterviews.id })
    if (updated.length === 0) throw new ConcurrencyError()
  },

  delete: async (id) => {
    await tx.delete(researchPlannedInterviews).where(eq(researchPlannedInterviews.id, id))
  },
})
