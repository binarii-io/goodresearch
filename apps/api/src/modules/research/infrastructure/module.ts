import type { Clock } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makeCreateProject } from '../application/commands/create-project.ts'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makeRenameProject } from '../application/commands/rename-project.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { ResearchCommandDeps, StudyActionGate, TeamDirectory } from '../application/ports.ts'
import { makeProjectQueries, type TeamNames } from '../application/queries/project-queries.ts'
import { makeStudyQueries, type SourceSummaries } from '../application/queries/study-queries.ts'
import type { ResearchHandlers } from './http.routes.ts'
import { drizzleProjectRepository } from './project.drizzle-repository.ts'
import { drizzleStudyRepository } from './study.drizzle-repository.ts'

export const createResearchModule = (deps: {
  db: Db
  clock: Clock
  teams: TeamDirectory
  teamNames: TeamNames
  /** Lazily bound: the ingestion module is built after this one. */
  ingestion: () => { gate: StudyActionGate; sourceSummaries: SourceSummaries }
}) => {
  const commandDeps: ResearchCommandDeps = {
    uow: (work) => deps.db.transaction((tx) => work({ projects: drizzleProjectRepository(tx) })),
    clock: deps.clock,
    teams: deps.teams,
  }
  const queries = makeProjectQueries(deps)
  const studyQueries = makeStudyQueries({
    db: deps.db,
    teams: deps.teams,
    sourceSummaries: (accountId, ids) => deps.ingestion().sourceSummaries(accountId, ids),
  })
  const handlers: ResearchHandlers = {
    createProject: makeCreateProject(commandDeps),
    renameProject: makeRenameProject(commandDeps),
    updateProjectGoal: makeUpdateProjectGoal(commandDeps),
    moveProjectToTeam: makeMoveProjectToTeam(commandDeps),
    queries,
    studies: makeStudyCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      gate: { canAct: (accountId, studyId) => deps.ingestion().gate.canAct(accountId, studyId) },
    }),
    studyQueries,
  }
  return {
    handlers,
    countProjectsByTeam: queries.countProjectsByTeam,
    countProjectsByTeams: queries.countProjectsByTeams,
    getStudyAccess: studyQueries.getStudyAccess,
  }
}
