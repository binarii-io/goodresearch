import { type Clock, err, ok, type Result } from '@goodresearch/shared'
import type { Actor, TeamId } from '../../domain/actor.ts'
import type { ProjectCounter, WorkspaceUnitOfWork } from '../ports.ts'

export type DeleteTeamError =
  | 'FORBIDDEN'
  | 'TEAM_NOT_FOUND'
  | 'TEAM_HAS_PROJECTS'
  | 'TEAM_HAS_STUDIES'

/**
 * FR-022: a team with projects cannot be deleted; an empty team is deleted with its memberships,
 * each removal recorded in the members' access history. The database foreign key from projects is
 * the safety net against a project created meanwhile.
 */
export const makeDeleteTeam =
  (deps: { uow: WorkspaceUnitOfWork; clock: Clock; projects: ProjectCounter }) =>
  (c: { actor: Actor; teamId: string }): Promise<Result<void, DeleteTeamError>> =>
    deps.uow(async ({ teams, accounts }) => {
      if (c.actor.role !== 'admin') return err('FORBIDDEN')
      const team = await teams.findById(c.teamId as TeamId)
      if (!team) return err('TEAM_NOT_FOUND')
      const projectCount = await deps.projects.countByTeam(team.id)
      if (projectCount > 0) return err('TEAM_HAS_PROJECTS', { projectCount })
      // Spec 019: a study can outlive its projects, and still belongs to its team.
      if ((await deps.projects.countStudiesByTeam(team.id)) > 0) return err('TEAM_HAS_STUDIES')
      const now = deps.clock.now()
      for (const member of await accounts.findByTeam(team.id)) {
        member.removeTeam({ id: team.id, name: team.name }, c.actor.id, now)
        await accounts.save(member)
      }
      await teams.delete(team.id)
      return ok(undefined)
    })
