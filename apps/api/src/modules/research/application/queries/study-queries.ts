import type { StudyDetail, StudySummary } from '@goodresearch/contracts'
import { desc, eq } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { researchProjects, researchStudies } from '../../infrastructure/schema.ts'
import type { TeamDirectory } from '../ports.ts'

/**
 * Folder of each study, from the ingestion module (wired in compose.ts). The name is only given
 * where this account's access to the folder was confirmed (spec 002 FR-010a).
 */
export type SourceSummaries = (
  accountId: string,
  studyIds: readonly string[],
) => Promise<ReadonlyMap<string, { folderName: string | null }>>

export const makeStudyQueries = (deps: {
  db: Db
  teams: TeamDirectory
  sourceSummaries: SourceSummaries
}) => {
  const { db } = deps

  const projectFor = async (accountId: string, projectId: string) => {
    const access = await deps.teams.getAccessContext(accountId)
    const [project] = await db
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.id, projectId))
    if (!access || !project) return null
    return access.role === 'admin' || access.teamIds.includes(project.teamId)
      ? { project, role: access.role }
      : null
  }

  return {
    listStudies: async (accountId: string, projectId: string): Promise<StudySummary[] | null> => {
      if (!(await projectFor(accountId, projectId))) return null
      const rows = await db
        .select()
        .from(researchStudies)
        .where(eq(researchStudies.projectId, projectId))
        .orderBy(desc(researchStudies.updatedAt))
      const folders = await deps.sourceSummaries(
        accountId,
        rows.map((r) => r.id),
      )
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type as StudySummary['type'],
        hasFolder: folders.has(r.id),
        folderName: folders.get(r.id)?.folderName ?? null,
        updatedAt: r.updatedAt.toISOString(),
      }))
    },

    getStudy: async (accountId: string, studyId: string): Promise<StudyDetail | null> => {
      const [study] = await db.select().from(researchStudies).where(eq(researchStudies.id, studyId))
      const visible = study ? await projectFor(accountId, study.projectId) : null
      if (!study || !visible) return null
      return {
        id: study.id,
        name: study.name,
        type: study.type as StudyDetail['type'],
        project: { id: visible.project.id, name: visible.project.name },
        anonymised: study.anonymised,
        createdAt: study.createdAt.toISOString(),
        updatedAt: study.updatedAt.toISOString(),
        version: study.version,
      }
    },

    /** For the ingestion module: who may see this study at all (project team, spec 001). */
    getStudyAccess: async (
      accountId: string,
      studyId: string,
    ): Promise<{
      role: 'admin' | 'member'
      type: string
      teamId: string
      anonymised: boolean
    } | null> => {
      const [study] = await db
        .select({
          projectId: researchStudies.projectId,
          type: researchStudies.type,
          anonymised: researchStudies.anonymised,
        })
        .from(researchStudies)
        .where(eq(researchStudies.id, studyId))
      const visible = study ? await projectFor(accountId, study.projectId) : null
      return visible && study
        ? {
            role: visible.role,
            type: study.type,
            teamId: visible.project.teamId,
            anonymised: study.anonymised,
          }
        : null
    },
  }
}

export type StudyQueries = ReturnType<typeof makeStudyQueries>
