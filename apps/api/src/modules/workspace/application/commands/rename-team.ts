import { type Clock, ConcurrencyError, err, ok, type Result } from '@goodresearch/shared'
import type { Actor, TeamId } from '../../domain/actor.ts'
import type { WorkspaceUnitOfWork } from '../ports.ts'

export type RenameTeamError =
  | 'FORBIDDEN'
  | 'TEAM_NOT_FOUND'
  | 'TEAM_NAME_TAKEN'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'

export const makeRenameTeam =
  (deps: { uow: WorkspaceUnitOfWork; clock: Clock }) =>
  (c: {
    actor: Actor
    teamId: string
    name: string
    version: number
  }): Promise<Result<{ version: number }, RenameTeamError>> =>
    deps.uow(async ({ teams }) => {
      if (c.actor.role !== 'admin') return err('FORBIDDEN')
      const team = await teams.findById(c.teamId as TeamId)
      if (!team) return err('TEAM_NOT_FOUND')
      if (team.version !== c.version) return err('VERSION_CONFLICT')
      const renamed = team.rename(c.name, deps.clock.now())
      if (!renamed.ok) return renamed
      if (await teams.existsByNameKey(team.nameKey, team.id)) return err('TEAM_NAME_TAKEN')
      try {
        await teams.save(team)
      } catch (error) {
        if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
        throw error
      }
      return ok({ version: c.version + 1 })
    })
