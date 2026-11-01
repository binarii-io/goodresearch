import { err, ok } from '@goodresearch/shared'
import { canUseTeam } from '../access.ts'
import type { ResearchCommandDeps } from '../ports.ts'
import { editProject } from './edit-project.ts'

/**
 * Its studies go with it, in the same transaction: their access follows their team (spec 019 R7).
 * A study also in another project stays, and so does the project: a study remains in one team.
 */
export const makeMoveProjectToTeam =
  (deps: ResearchCommandDeps) =>
  (command: { actor: { id: string }; projectId: string; teamId: string; version: number }) =>
    editProject(deps, command, async (project, now, { studies }) => {
      const access = await deps.teams.getAccessContext(command.actor.id)
      if (!access || !(await canUseTeam(deps.teams, access, command.teamId)))
        return err('TEAM_NOT_FOUND')
      const linked = await studies.findByProject(project.id)
      if (linked.some((s) => s.projectIds.length > 1)) return err('STUDY_SHARED')
      for (const study of linked) {
        study.moveToTeam(command.teamId, now)
        await studies.save(study)
      }
      project.moveToTeam(command.teamId, now)
      return ok(undefined)
    })
