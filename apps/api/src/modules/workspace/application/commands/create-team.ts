import { type Clock, err, newId, ok, type Result } from '@goodresearch/shared'
import type { Actor } from '../../domain/actor.ts'
import { Team } from '../../domain/team.ts'
import type { WorkspaceUnitOfWork } from '../ports.ts'

export type CreateTeamError = 'FORBIDDEN' | 'VALIDATION' | 'TEAM_NAME_TAKEN'

export const makeCreateTeam =
  (deps: { uow: WorkspaceUnitOfWork; clock: Clock }) =>
  (command: { actor: Actor; name: string }): Promise<Result<{ id: string }, CreateTeamError>> =>
    deps.uow(async ({ teams }) => {
      if (command.actor.role !== 'admin') return err('FORBIDDEN')
      const created = Team.create({ id: newId(), name: command.name, now: deps.clock.now() })
      if (!created.ok) return created
      const team = created.value
      if (await teams.existsByNameKey(team.nameKey)) return err('TEAM_NAME_TAKEN')
      await teams.save(team)
      return ok({ id: team.id })
    })
