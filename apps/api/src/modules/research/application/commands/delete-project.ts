import { err, ok, type Result } from '@goodresearch/shared'
import type { ProjectRunGate, ResearchCommandDeps } from '../ports.ts'

export type DeleteProjectError =
  | 'PROJECT_NOT_FOUND'
  | 'FORBIDDEN'
  | 'SYNTHESIS_RUNNING'
  | 'NAME_MISMATCH'

/**
 * Spec 020: for good, with the project's exact name. Its insights, recommendations and key
 * takeaways go with it; its studies stay, on their team's page if they are in no other project.
 */
export const makeDeleteProject =
  (deps: ResearchCommandDeps & { runs: ProjectRunGate }) =>
  (c: {
    actor: { id: string; role: 'admin' | 'member' }
    projectId: string
    name: string
  }): Promise<Result<void, DeleteProjectError>> =>
    deps.uow(async ({ projects }) => {
      const access = await deps.teams.getAccessContext(c.actor.id)
      const project = await projects.findById(c.projectId)
      if (
        !access ||
        !project ||
        (access.role !== 'admin' && !access.teamIds.includes(project.teamId))
      )
        return err('PROJECT_NOT_FOUND')
      if (!project.canBeDeletedBy({ id: c.actor.id, role: access.role })) return err('FORBIDDEN')
      if (await deps.runs.isRunning(project.id)) return err('SYNTHESIS_RUNNING')
      if (!project.confirms(c.name)) return err('NAME_MISMATCH')
      await projects.delete(project.id)
      return ok(undefined)
    })
