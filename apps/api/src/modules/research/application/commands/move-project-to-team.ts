import { err, ok } from '@goodresearch/shared'
import { canUseTeam } from '../access.ts'
import type { ResearchCommandDeps } from '../ports.ts'
import { editProject } from './edit-project.ts'

export const makeMoveProjectToTeam =
  (deps: ResearchCommandDeps) =>
  (command: { actor: { id: string }; projectId: string; teamId: string; version: number }) =>
    editProject(deps, command, async (project, now) => {
      const access = await deps.teams.getAccessContext(command.actor.id)
      if (!access || !(await canUseTeam(deps.teams, access, command.teamId)))
        return err('TEAM_NOT_FOUND')
      project.moveToTeam(command.teamId, now)
      return ok(undefined)
    })
