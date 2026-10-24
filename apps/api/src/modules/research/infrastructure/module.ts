import type { Clock } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makeCreateProject } from '../application/commands/create-project.ts'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makeRenameProject } from '../application/commands/rename-project.ts'
import { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { ResearchCommandDeps, TeamDirectory } from '../application/ports.ts'
import { makeProjectQueries, type TeamNames } from '../application/queries/project-queries.ts'
import type { ResearchHandlers } from './http.routes.ts'
import { drizzleProjectRepository } from './project.drizzle-repository.ts'

export const createResearchModule = (deps: {
  db: Db
  clock: Clock
  teams: TeamDirectory
  teamNames: TeamNames
}) => {
  const commandDeps: ResearchCommandDeps = {
    uow: (work) => deps.db.transaction((tx) => work({ projects: drizzleProjectRepository(tx) })),
    clock: deps.clock,
    teams: deps.teams,
  }
  const queries = makeProjectQueries(deps)
  const handlers: ResearchHandlers = {
    createProject: makeCreateProject(commandDeps),
    renameProject: makeRenameProject(commandDeps),
    updateProjectGoal: makeUpdateProjectGoal(commandDeps),
    moveProjectToTeam: makeMoveProjectToTeam(commandDeps),
    queries,
  }
  return {
    handlers,
    countProjectsByTeam: queries.countProjectsByTeam,
    countProjectsByTeams: queries.countProjectsByTeams,
  }
}
