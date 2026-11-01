import { ConcurrencyError } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { ProjectRepository } from '../domain/project.repository.ts'
import { Project, type ProjectId } from '../domain/project.ts'
import { researchProjects } from './schema.ts'

export const drizzleProjectRepository = (tx: Executor): ProjectRepository => ({
  findById: async (id) => {
    const [row] = await tx.select().from(researchProjects).where(eq(researchProjects.id, id))
    return row ? Project.fromPersistence({ ...row, id: row.id as ProjectId }) : null
  },

  delete: async (id) => {
    await tx.delete(researchProjects).where(eq(researchProjects.id, id))
  },

  save: async (project) => {
    const p = project.snapshot()
    const updated = await tx
      .update(researchProjects)
      .set({
        teamId: p.teamId,
        name: p.name,
        goal: p.goal,
        updatedAt: p.updatedAt,
        version: sql`${researchProjects.version} + 1`,
      })
      .where(and(eq(researchProjects.id, p.id), eq(researchProjects.version, p.version)))
      .returning({ id: researchProjects.id })
    if (updated.length > 0) return
    const inserted = await tx
      .insert(researchProjects)
      .values({ ...p, version: 0 })
      .onConflictDoNothing({ target: researchProjects.id })
      .returning({ id: researchProjects.id })
    if (inserted.length === 0) throw new ConcurrencyError()
  },
})
