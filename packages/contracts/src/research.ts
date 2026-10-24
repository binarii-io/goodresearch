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
