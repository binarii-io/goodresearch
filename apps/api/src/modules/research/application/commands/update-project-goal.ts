import type { ResearchCommandDeps } from '../ports.ts'
import { editProject } from './edit-project.ts'

export const makeUpdateProjectGoal =
  (deps: ResearchCommandDeps) =>
  (command: { actor: { id: string }; projectId: string; goal: string; version: number }) =>
    editProject(deps, command, async (project, now) => project.updateGoal(command.goal, now))
