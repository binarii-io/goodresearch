import { ConcurrencyError, err, ok, type Result } from '@goodresearch/shared'
import type { Project } from '../../domain/project.ts'
import type { ResearchCommandDeps, ResearchRepositories } from '../ports.ts'

export type EditProjectError =
  | 'PROJECT_NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'
  | 'TEAM_NOT_FOUND'
  | 'STUDY_SHARED'

/**
 * Shared flow of every project edit: load in one transaction, hide inaccessible projects (FR-012),
 * refuse stale versions (FR-020), apply the change, save.
 */
export const editProject = (
  deps: ResearchCommandDeps,
  command: { actor: { id: string }; projectId: string; version: number },
  change: (
    project: Project,
    now: Date,
    repositories: ResearchRepositories,
  ) => Promise<Result<void, 'VALIDATION' | 'TEAM_NOT_FOUND' | 'STUDY_SHARED'>>,
): Promise<Result<{ version: number }, EditProjectError>> =>
  deps
    .uow(async (repositories): Promise<Result<{ version: number }, EditProjectError>> => {
      const { projects } = repositories
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
      const changed = await change(project, deps.clock.now(), repositories)
      if (!changed.ok) return changed
      await projects.save(project)
      return ok({ version: command.version + 1 })
    })
    .catch((error: unknown): Result<{ version: number }, EditProjectError> => {
      // Thrown out of the transaction, so everything the change saved is undone (spec 019 R7).
      if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
      throw error
    })
