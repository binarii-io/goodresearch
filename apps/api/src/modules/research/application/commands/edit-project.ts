import { ConcurrencyError, err, ok, type Result } from '@goodresearch/shared'
import type { Project } from '../../domain/project.ts'
import type { ResearchCommandDeps } from '../ports.ts'

export type EditProjectError =
  | 'PROJECT_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'
  | 'TEAM_NOT_FOUND'

/**
 * Shared flow of every project edit: load in one transaction, hide inaccessible projects (FR-012),
 * refuse stale versions (FR-020), apply the change, save.
 */
export const editProject = (
  deps: ResearchCommandDeps,
  command: { actor: { id: string }; projectId: string; version: number },
  change: (project: Project, now: Date) => Promise<Result<void, 'VALIDATION' | 'TEAM_NOT_FOUND'>>,
): Promise<Result<{ version: number }, EditProjectError>> =>
  deps.uow(async ({ projects }) => {
    const access = await deps.teams.getAccessContext(command.actor.id)
    const project = await projects.findById(command.projectId)
    if (
      !access ||
      !project ||
      (access.role !== 'admin' && !access.teamIds.includes(project.teamId))
    ) {
      return err('PROJECT_NOT_FOUND')
    }
    if (project.version !== command.version) return err('VERSION_CONFLICT')
    const changed = await change(project, deps.clock.now())
    if (!changed.ok) return changed
    try {
      await projects.save(project)
    } catch (error) {
      if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
      throw error
    }
    return ok({ version: command.version + 1 })
  })
