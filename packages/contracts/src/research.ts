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
    createdAt: Timestamp,
    updatedAt: Timestamp,
    version: Version,
  })
  .meta({ id: 'ProjectDetail' })
export type ProjectDetail = z.infer<typeof ProjectDetail>

// Query strings and params stay anonymous: @fastify/swagger cannot resolve named refs there.
export const ListProjectsQuery = z.object({ team: Id.optional() })
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
    project: z.object({ id: Id, name: z.string() }),
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

export const CreateStudy = z
  .object({ name: StudyName, type: StudyType })
  .meta({ id: 'CreateStudy' })
export const RenameStudy = z
  .object({ name: StudyName, version: Version })
  .meta({ id: 'RenameStudy' })
export const StudyParams = z.object({ studyId: Id })
export const StudySettings = z
  .object({ anonymised: z.boolean(), textAnalysed: TextAnalysed.optional(), version: Version })
  .meta({ id: 'StudySettings' })
