import { err, newId, ok, type Result } from '@goodresearch/shared'
import { Project } from '../../domain/project.ts'
import { canUseTeam } from '../access.ts'
import type { ResearchCommandDeps } from '../ports.ts'

export type CreateProjectError = 'VALIDATION' | 'TEAM_NOT_FOUND'

export const makeCreateProject =
  (deps: ResearchCommandDeps) =>
  async (command: {
    actor: { id: string }
    name: string
    goal: string
    teamId: string
  }): Promise<Result<{ id: string }, CreateProjectError>> => {
    const access = await deps.teams.getAccessContext(command.actor.id)
    if (!access || !(await canUseTeam(deps.teams, access, command.teamId)))
      return err('TEAM_NOT_FOUND')
    const created = Project.create({
      id: newId(),
      teamId: command.teamId,
      name: command.name,
      goal: command.goal,
      createdBy: command.actor.id,
      now: deps.clock.now(),
    })
    if (!created.ok) return created
    await deps.uow(({ projects }) => projects.save(created.value))
    return ok({ id: created.value.id })
  }
