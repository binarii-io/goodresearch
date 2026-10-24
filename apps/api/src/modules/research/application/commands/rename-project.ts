import type { ResearchCommandDeps } from '../ports.ts'
import { editProject } from './edit-project.ts'

export const makeRenameProject =
  (deps: ResearchCommandDeps) =>
  (command: { actor: { id: string }; projectId: string; name: string; version: number }) =>
    editProject(deps, command, async (project, now) => project.rename(command.name, now))
