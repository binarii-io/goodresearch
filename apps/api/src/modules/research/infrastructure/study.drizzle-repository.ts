import { ConcurrencyError } from '@goodresearch/shared'
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { StudyRepository } from '../domain/study.repository.ts'
import { Study, type StudyId, type StudyType, type TextAnalysed } from '../domain/study.ts'
import { researchStudies, researchStudyProjects } from './schema.ts'

export const drizzleStudyRepository = (tx: Executor): StudyRepository => {
  const load = async (rows: (typeof researchStudies.$inferSelect)[]) => {
    const links = rows.length
      ? await tx
          .select()
          .from(researchStudyProjects)
          .where(
            inArray(
              researchStudyProjects.studyId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(researchStudyProjects.linkedAt))
      : []
    return rows.map((row) =>
      Study.fromPersistence({
        ...row,
        id: row.id as StudyId,
        type: row.type as StudyType,
        textAnalysed: row.textAnalysed as TextAnalysed,
        projectIds: links.filter((l) => l.studyId === row.id).map((l) => l.projectId),
      }),
    )
  }

  return {
    findById: async (id) => {
      const rows = await tx.select().from(researchStudies).where(eq(researchStudies.id, id))
      return (await load(rows))[0] ?? null
    },

    findByProject: async (projectId) =>
      load(
        await tx
          .select({ study: researchStudies })
          .from(researchStudies)
          .innerJoin(researchStudyProjects, eq(researchStudyProjects.studyId, researchStudies.id))
          .where(eq(researchStudyProjects.projectId, projectId))
          .then((rows) => rows.map((r) => r.study)),
      ),

    save: (study) =>
      tx.transaction(async (t) => {
        const { projectIds, ...p } = study.snapshot()
        const updated = await t
          .update(researchStudies)
          .set({
            teamId: p.teamId,
            goal: p.goal,
            name: p.name,
            anonymised: p.anonymised,
            textAnalysed: p.textAnalysed,
            updatedAt: p.updatedAt,
            version: sql`${researchStudies.version} + 1`,
          })
          .where(and(eq(researchStudies.id, p.id), eq(researchStudies.version, p.version)))
          .returning({ id: researchStudies.id })
        if (updated.length === 0) {
          const inserted = await t
            .insert(researchStudies)
            .values({ ...p, version: 0 })
            .onConflictDoNothing({ target: researchStudies.id })
            .returning({ id: researchStudies.id })
          if (inserted.length === 0) throw new ConcurrencyError()
        }
        await t
          .delete(researchStudyProjects)
          .where(
            projectIds.length
              ? and(
                  eq(researchStudyProjects.studyId, p.id),
                  notInArray(researchStudyProjects.projectId, [...projectIds]),
                )
              : eq(researchStudyProjects.studyId, p.id),
          )
        if (projectIds.length)
          await t
            .insert(researchStudyProjects)
            .values(
              projectIds.map((projectId) => ({
                studyId: p.id,
                projectId,
                linkedAt: p.updatedAt,
              })),
            )
            .onConflictDoNothing()
      }),

    delete: async (id) => {
      await tx.delete(researchStudies).where(eq(researchStudies.id, id))
    },
  }
}
