import { ConcurrencyError } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { StudyRepository } from '../domain/study.repository.ts'
import { Study, type StudyId, type StudyType } from '../domain/study.ts'
import { researchStudies } from './schema.ts'

export const drizzleStudyRepository = (tx: Executor): StudyRepository => ({
  findById: async (id) => {
    const [row] = await tx.select().from(researchStudies).where(eq(researchStudies.id, id))
    return row
      ? Study.fromPersistence({ ...row, id: row.id as StudyId, type: row.type as StudyType })
      : null
  },

  save: async (study) => {
    const p = study.snapshot()
    const updated = await tx
      .update(researchStudies)
      .set({
        name: p.name,
        anonymised: p.anonymised,
        updatedAt: p.updatedAt,
        version: sql`${researchStudies.version} + 1`,
      })
      .where(and(eq(researchStudies.id, p.id), eq(researchStudies.version, p.version)))
      .returning({ id: researchStudies.id })
    if (updated.length > 0) return
    const inserted = await tx
      .insert(researchStudies)
      .values({ ...p, version: 0 })
      .onConflictDoNothing({ target: researchStudies.id })
      .returning({ id: researchStudies.id })
    if (inserted.length === 0) throw new ConcurrencyError()
  },

  delete: async (id) => {
    await tx.delete(researchStudies).where(eq(researchStudies.id, id))
  },
})
