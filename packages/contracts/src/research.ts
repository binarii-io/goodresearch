import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'
import { TeamRef } from './workspace.ts'

export const ProjectName = z.string().trim().min(1).max(120)
export const ProjectGoal = z.string().max(10_000)

export const ProjectSummary = z
  .object({ id: Id, name: z.string(), team: TeamRef, updatedAt: Timestamp })
  .meta({ id: 'ProjectSummary' })
export type ProjectSummary = z.infer<typeof ProjectSummary>

export const ProjectDetail = z
  .object({
    id: Id,
    name: z.string(),
    goal: z.string(),
    team: TeamRef,
    /** Spec 020: an admin, or its creator. */
    canDelete: z.boolean(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    version: Version,
  })
  .meta({ id: 'ProjectDetail' })
export type ProjectDetail = z.infer<typeof ProjectDetail>

// Query strings and params stay anonymous: @fastify/swagger cannot resolve named refs there.
export const ListProjectsQuery = z.object({ team: Id.optional() })
/** Spec 020: the project's name, typed by the person to confirm a deletion. */
export const ConfirmWithName = z
  .object({ name: z.string().max(200) })
  .meta({ id: 'ConfirmWithName' })
export const CreateProject = z
  .object({ name: ProjectName, goal: ProjectGoal.default(''), teamId: Id })
  .meta({ id: 'CreateProject' })
export const RenameProject = z
  .object({ name: ProjectName, version: Version })
  .meta({ id: 'RenameProject' })
export const UpdateProjectGoal = z
  .object({ goal: ProjectGoal, version: Version })
  .meta({ id: 'UpdateProjectGoal' })
export const MoveProject = z.object({ teamId: Id, version: Version }).meta({ id: 'MoveProject' })
export const ProjectParams = z.object({ projectId: Id })

export const StudyName = z.string().trim().min(1).max(120)
export const StudyType = z.enum(['interviews', 'survey', 'usability-test'])

export const StudySummary = z
  .object({
    id: Id,
    name: z.string(),
    type: StudyType,
    hasFolder: z.boolean(),
    /** Only for people whose access to the folder was confirmed (spec 002 FR-010a). */
    folderName: z.string().nullable(),
    /** Spec 019: the other projects it feeds. */
    alsoIn: z.array(z.object({ id: Id, name: z.string() })),
    updatedAt: Timestamp,
  })
  .meta({ id: 'StudySummary' })
export type StudySummary = z.infer<typeof StudySummary>

/** Spec 012: the text Analysis reads. */
export const TextAnalysed = z.enum(['with-corrections', 'clean-only'])

export const StudyDetail = z
  .object({
    id: Id,
    name: z.string(),
    type: StudyType,
    /** Spec 019: the projects it feeds, earliest link first; possibly none. */
    projects: z.array(z.object({ id: Id, name: z.string() })),
    team: z.object({ id: Id, name: z.string() }),
    /** Spec 019: read by the AI steps inside the study. */
    goal: z.string(),
    /** Spec 009: names and titles of interviews use pseudonyms. */
    anonymised: z.boolean(),
    /** Spec 012: the text Analysis reads. */
    textAnalysed: TextAnalysed,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    version: Version,
  })
  .meta({ id: 'StudyDetail' })
export type StudyDetail = z.infer<typeof StudyDetail>

/** Spec 019: a study of a team, on its Studies page and when attaching. */
export const TeamStudy = z
  .object({
    id: Id,
    name: z.string(),
    type: StudyType,
    projects: z.array(z.object({ id: Id, name: z.string() })),
    hasFolder: z.boolean(),
    /** Only for people whose access to the folder was confirmed. */
    folderName: z.string().nullable(),
    /** Whether this person can open it, so attach it. */
    canAttach: z.boolean(),
    updatedAt: Timestamp,
  })
  .meta({ id: 'TeamStudy' })

export const TeamStudies = z
  .object({ studies: z.array(TeamStudy), hasMore: z.boolean() })
  .meta({ id: 'TeamStudies' })
export type TeamStudies = z.infer<typeof TeamStudies>

export const TeamStudiesQuery = z.object({
  q: z.string().trim().max(120).optional(),
  notInProject: Id.optional(),
})

export const UpdateStudyGoal = z
  .object({ goal: z.string().trim().max(10_000), version: Version })
  .meta({ id: 'UpdateStudyGoal' })

export const CreateStudy = z
  .object({ name: StudyName, type: StudyType })
  .meta({ id: 'CreateStudy' })
/** Spec 021: a study of the team, in no project. */
export const CreateTeamStudy = z
  .object({ name: StudyName, goal: z.string().trim().max(10_000).default('') })
  .meta({ id: 'CreateTeamStudy' })
export const RenameStudy = z
  .object({ name: StudyName, version: Version })
  .meta({ id: 'RenameStudy' })
export const StudyParams = z.object({ studyId: Id })
export const StudySettings = z
  .object({ anonymised: z.boolean(), textAnalysed: TextAnalysed.optional(), version: Version })
  .meta({ id: 'StudySettings' })
