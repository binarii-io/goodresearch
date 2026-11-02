import type { InterviewGuide, PlannedInterview } from '@goodresearch/contracts'
import { err, ok, type Result } from '@goodresearch/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { GuideContent } from '../../domain/interview-guide.ts'
import type { PlannedInterviewStatus } from '../../domain/planned-interview.ts'
import {
  researchInterviewGuides,
  researchPlannedInterviews,
  researchStudies,
} from '../../infrastructure/schema.ts'
import type { StudyActionGate, TeamDirectory } from '../ports.ts'

type Denied = 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_AN_INTERVIEW_STUDY'

/** Reads of a study's preparation (spec 006), with the same gate as its commands. */
export const makePreparationQueries = (deps: {
  db: Db
  teams: TeamDirectory
  gate: StudyActionGate
}) => {
  const { db } = deps

  const allowed = async (
    accountId: string,
    studyId: string,
  ): Promise<Result<{ type: string }, Denied>> => {
    const [row] = await db
      .select({ teamId: researchStudies.teamId, type: researchStudies.type })
      .from(researchStudies)
      .where(eq(researchStudies.id, studyId))
    const access = await deps.teams.getAccessContext(accountId)
    if (!row || !access || (access.role !== 'admin' && !access.teamIds.includes(row.teamId)))
      return err('STUDY_NOT_FOUND')
    return (await deps.gate.canAct(accountId, studyId))
      ? ok({ type: row.type })
      : err('FOLDER_ACCESS_REQUIRED')
  }

  const readable = async (
    accountId: string,
    studyId: string,
  ): Promise<Result<{ type: string; reader: boolean }, Denied>> => {
    const [row] = await db
      .select({ teamId: researchStudies.teamId, type: researchStudies.type })
      .from(researchStudies)
      .where(eq(researchStudies.id, studyId))
    const access = await deps.teams.getAccessContext(accountId)
    if (!row || !access) return err('STUDY_NOT_FOUND')
    return (await deps.gate.canRead(accountId, studyId))
      ? ok({
          type: row.type,
          reader: access.role !== 'admin' && !access.teamIds.includes(row.teamId),
        })
      : err('FOLDER_ACCESS_REQUIRED')
  }

  const guideOf = async (studyId: string): Promise<InterviewGuide | null> => {
    const [row] = await db
      .select({ guide: researchInterviewGuides, updatedByName: auth_users.name })
      .from(researchInterviewGuides)
      .leftJoin(auth_users, eq(auth_users.id, researchInterviewGuides.updatedBy))
      .where(eq(researchInterviewGuides.studyId, studyId))
    if (!row) return null
    const g = row.guide
    return {
      studyId: g.studyId,
      content: g.content as GuideContent as InterviewGuide['content'],
      origin: g.origin as InterviewGuide['origin'],
      // An anonymised (deleted) account has an empty name.
      updatedBy: row.updatedByName === null ? null : { name: row.updatedByName },
      updatedAt: g.updatedAt.toISOString(),
      version: g.version,
    }
  }

  const scheduleOf = async (studyId: string): Promise<PlannedInterview[]> => {
    const rows = await db
      .select()
      .from(researchPlannedInterviews)
      .where(eq(researchPlannedInterviews.studyId, studyId))
      .orderBy(
        sql`${researchPlannedInterviews.scheduledAt} asc nulls last`,
        asc(researchPlannedInterviews.createdAt),
      )
    return rows.map((r) => ({
      id: r.id,
      interviewee: r.interviewee,
      role: r.role,
      interviewers: r.interviewers,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      status: r.status as PlannedInterviewStatus,
      notes: r.notes,
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
    }))
  }

  return {
    /** Spec 026: the names of the schedule, to mask in what a reader gets; never shown. */
    scheduleNames: async (studyId: string) =>
      (await scheduleOf(studyId)).map((p) => ({
        interviewee: p.interviewee,
        interviewers: p.interviewers,
      })),

    /** Spec 026: the theme sections of a guide, for a reader whose access was checked. */
    themesOf: async (studyId: string): Promise<{ id: string; title: string }[]> =>
      ((await guideOf(studyId))?.content.sections ?? [])
        .filter((s) => s.kind === 'theme')
        .map((s) => ({ id: s.id, title: s.title })),

    /** Spec 026: the study owning a planned interview. */
    studyOfPlanned: async (id: string): Promise<string | null> => {
      const [row] = await db
        .select({ studyId: researchPlannedInterviews.studyId })
        .from(researchPlannedInterviews)
        .where(eq(researchPlannedInterviews.id, id))
      return row?.studyId ?? null
    },

    getGuide: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<InterviewGuide | null, Denied>> => {
      // Spec 026: the guide holds no name; every active member reads it, after the folder barrier.
      const access = await readable(accountId, studyId)
      if (!access.ok) return access
      if (access.value.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY')
      const guide = await guideOf(studyId)
      // Who wrote it stays with the team.
      return ok(guide && access.value.reader ? { ...guide, updatedBy: null } : guide)
    },

    /** Sorted by date and time, undated last (US5). */
    listPlannedInterviews: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<PlannedInterview[], Denied>> => {
      const access = await allowed(accountId, studyId)
      if (!access.ok) return access
      if (access.value.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY')
      return ok(await scheduleOf(studyId))
    },

    /**
     * What the assistant may know of a study's preparation (spec 006 FR-005, FR-013): the guide,
     * and only counts of the schedule. `null` without access or for another type of study.
     */
    preparationForAssistant: async (
      accountId: string,
      studyId: string,
    ): Promise<{
      guide: { version: number; content: InterviewGuide['content'] } | null
      schedule: Partial<Record<PlannedInterviewStatus, number>>
    } | null> => {
      const access = await allowed(accountId, studyId)
      if (!access.ok || access.value.type !== 'interviews') return null
      const guide = await guideOf(studyId)
      const counts = await db
        .select({ status: researchPlannedInterviews.status, n: sql<number>`count(*)::int` })
        .from(researchPlannedInterviews)
        .where(eq(researchPlannedInterviews.studyId, studyId))
        .groupBy(researchPlannedInterviews.status)
      return {
        guide: guide ? { version: guide.version, content: guide.content } : null,
        schedule: Object.fromEntries(counts.map((c) => [c.status, c.n])),
      }
    },
  }
}

export type PreparationQueries = ReturnType<typeof makePreparationQueries>
