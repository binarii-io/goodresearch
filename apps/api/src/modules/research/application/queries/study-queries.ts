import type { StudyDetail, StudySummary, TeamStudies } from '@goodresearch/contracts'
import { and, asc, count, desc, eq, ilike, inArray, notExists } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import {
  researchProjects,
  researchStudies,
  researchStudyProjects,
} from '../../infrastructure/schema.ts'
import type { TeamDirectory } from '../ports.ts'
import type { TeamNames } from './project-queries.ts'

/**
 * Folder of each study, from the ingestion module (wired in compose.ts). The name is only given
 * where this account's access to the folder was confirmed (spec 002 FR-010a).
 */
export type SourceSummaries = (
  accountId: string,
  studyIds: readonly string[],
) => Promise<ReadonlyMap<string, { folderName: string | null }>>

const TEAM_STUDIES_PAGE = 100

export const makeStudyQueries = (deps: {
  db: Db
  teams: TeamDirectory
  teamNames: TeamNames
  sourceSummaries: SourceSummaries
}) => {
  const { db } = deps

  const accessTo = async (accountId: string, teamId: string) => {
    const access = await deps.teams.getAccessContext(accountId)
    return access && (access.role === 'admin' || access.teamIds.includes(teamId)) ? access : null
  }

  const projectFor = async (accountId: string, projectId: string) => {
    const [project] = await db
      .select({ teamId: researchProjects.teamId })
      .from(researchProjects)
      .where(eq(researchProjects.id, projectId))
    return project && (await accessTo(accountId, project.teamId)) ? project : null
  }

  /** The projects of these studies, earliest link first. */
  const projectsOf = async (studyIds: readonly string[]) => {
    const rows = studyIds.length
      ? await db
          .select({
            studyId: researchStudyProjects.studyId,
            id: researchProjects.id,
            name: researchProjects.name,
          })
          .from(researchStudyProjects)
          .innerJoin(researchProjects, eq(researchProjects.id, researchStudyProjects.projectId))
          .where(inArray(researchStudyProjects.studyId, [...studyIds]))
          .orderBy(asc(researchStudyProjects.linkedAt))
      : []
    return (studyId: string) =>
      rows.filter((r) => r.studyId === studyId).map((r) => ({ id: r.id, name: r.name }))
  }

  return {
    listStudies: async (accountId: string, projectId: string): Promise<StudySummary[] | null> => {
      if (!(await projectFor(accountId, projectId))) return null
      const rows = await db
        .select({ study: researchStudies })
        .from(researchStudies)
        .innerJoin(researchStudyProjects, eq(researchStudyProjects.studyId, researchStudies.id))
        .where(eq(researchStudyProjects.projectId, projectId))
        .orderBy(desc(researchStudies.updatedAt))
        .then((found) => found.map((f) => f.study))
      const projects = await projectsOf(rows.map((r) => r.id))
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
        alsoIn: projects(r.id).filter((p) => p.id !== projectId),
        updatedAt: r.updatedAt.toISOString(),
      }))
    },

    /** Spec 019: the team's studies, on its Studies page and when attaching. */
    listTeamStudies: async (
      accountId: string,
      teamId: string,
      filter: { q?: string | undefined; notInProject?: string | undefined },
    ): Promise<TeamStudies | null> => {
      if (!(await accessTo(accountId, teamId)) || !(await deps.teams.teamExists(teamId)))
        return null
      const pattern = filter.q ? `%${filter.q.replace(/[%_\\]/g, '\\$&')}%` : null
      const rows = await db
        .select()
        .from(researchStudies)
        .where(
          and(
            eq(researchStudies.teamId, teamId),
            pattern ? ilike(researchStudies.name, pattern) : undefined,
            filter.notInProject
              ? notExists(
                  db
                    .select({ id: researchStudyProjects.studyId })
                    .from(researchStudyProjects)
                    .where(
                      and(
                        eq(researchStudyProjects.studyId, researchStudies.id),
                        eq(researchStudyProjects.projectId, filter.notInProject),
                      ),
                    ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(researchStudies.updatedAt))
        .limit(TEAM_STUDIES_PAGE + 1)
      const page = rows.slice(0, TEAM_STUDIES_PAGE)
      const ids = page.map((r) => r.id)
      const [projects, folders] = await Promise.all([
        projectsOf(ids),
        deps.sourceSummaries(accountId, ids),
      ])
      return {
        hasMore: rows.length > TEAM_STUDIES_PAGE,
        studies: page.map((r) => {
          const folder = folders.get(r.id)
          return {
            id: r.id,
            name: r.name,
            type: r.type as TeamStudies['studies'][number]['type'],
            projects: projects(r.id),
            hasFolder: Boolean(folder),
            folderName: folder?.folderName ?? null,
            canAttach: !folder || folder.folderName !== null,
            updatedAt: r.updatedAt.toISOString(),
          }
        }),
      }
    },

    getStudy: async (accountId: string, studyId: string): Promise<StudyDetail | null> => {
      const [study] = await db.select().from(researchStudies).where(eq(researchStudies.id, studyId))
      if (!study || !(await accessTo(accountId, study.teamId))) return null
      const [projects, names, folders] = await Promise.all([
        projectsOf([study.id]),
        deps.teamNames([study.teamId]),
        deps.sourceSummaries(accountId, [study.id]),
      ])
      const folder = folders.get(study.id)
      return {
        id: study.id,
        name: study.name,
        type: study.type as StudyDetail['type'],
        projects: projects(study.id),
        team: { id: study.teamId, name: names.get(study.teamId) ?? '' },
        // FR-010a: without access to the folder, only the name and type are shown.
        goal: folder && folder.folderName === null ? '' : study.goal,
        anonymised: study.anonymised,
        textAnalysed: study.textAnalysed as StudyDetail['textAnalysed'],
        createdAt: study.createdAt.toISOString(),
        updatedAt: study.updatedAt.toISOString(),
        version: study.version,
      }
    },

    /** Spec 019: a team with studies cannot be deleted, even without a project. */
    countStudiesByTeam: async (teamId: string): Promise<number> => {
      const [row] = await db
        .select({ value: count() })
        .from(researchStudies)
        .where(eq(researchStudies.teamId, teamId))
      return row?.value ?? 0
    },

    /** For the ingestion module: who may see this study at all (its team, spec 019). */
    getStudyAccess: async (
      accountId: string,
      studyId: string,
    ): Promise<{
      role: 'admin' | 'member'
      type: string
      teamId: string
      anonymised: boolean
      textAnalysed: 'with-corrections' | 'clean-only'
    } | null> => {
      const [study] = await db
        .select({
          teamId: researchStudies.teamId,
          type: researchStudies.type,
          anonymised: researchStudies.anonymised,
          textAnalysed: researchStudies.textAnalysed,
        })
        .from(researchStudies)
        .where(eq(researchStudies.id, studyId))
      const access = study ? await accessTo(accountId, study.teamId) : null
      return access && study
        ? {
            role: access.role,
            type: study.type,
            teamId: study.teamId,
            anonymised: study.anonymised,
            textAnalysed: study.textAnalysed as 'with-corrections' | 'clean-only',
          }
        : null
    },
  }
}

export type StudyQueries = ReturnType<typeof makeStudyQueries>
