import type { Clock } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makeCreateProject } from '../application/commands/create-project.ts'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makePreparationCommands } from '../application/commands/preparation-commands.ts'
import { makeRenameProject } from '../application/commands/rename-project.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type { ResearchCommandDeps, StudyActionGate, TeamDirectory } from '../application/ports.ts'
import { makePreparationQueries } from '../application/queries/preparation-queries.ts'
import { makeProjectQueries, type TeamNames } from '../application/queries/project-queries.ts'
import { makeStudyQueries, type SourceSummaries } from '../application/queries/study-queries.ts'
import type { ResearchHandlers } from './http.routes.ts'
import {
  drizzleGuideRepository,
  drizzlePlannedInterviewRepository,
} from './preparation.drizzle-repository.ts'
import { drizzleProjectRepository } from './project.drizzle-repository.ts'
import { drizzleStudyRepository } from './study.drizzle-repository.ts'

export const createResearchModule = (deps: {
  db: Db
  clock: Clock
  teams: TeamDirectory
  teamNames: TeamNames
  /** Lazily bound: the ingestion module is built after this one. */
  ingestion: () => {
    gate: StudyActionGate
    sourceSummaries: SourceSummaries
    /** Spec 009 FR-022: the interview linked to a planned interview follows its changes. */
    plannedChanged: NonNullable<Parameters<typeof makePreparationCommands>[0]['plannedChanged']>
  }
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
  const gate: StudyActionGate = {
    canAct: (accountId, studyId) => deps.ingestion().gate.canAct(accountId, studyId),
  }
  const preparationQueries = makePreparationQueries({ db: deps.db, teams: deps.teams, gate })
  const handlers: ResearchHandlers = {
    createProject: makeCreateProject(commandDeps),
    renameProject: makeRenameProject(commandDeps),
    updateProjectGoal: makeUpdateProjectGoal(commandDeps),
    moveProjectToTeam: makeMoveProjectToTeam(commandDeps),
    queries,
    studies: makeStudyCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      gate,
    }),
    studyQueries,
    preparation: makePreparationCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      guides: drizzleGuideRepository(deps.db),
      planned: drizzlePlannedInterviewRepository(deps.db),
      gate,
      plannedChanged: (actor, planned) => deps.ingestion().plannedChanged(actor, planned),
    }),
    preparationQueries,
  }
  return {
    handlers,
    countProjectsByTeam: queries.countProjectsByTeam,
    countProjectsByTeams: queries.countProjectsByTeams,
    getStudyAccess: studyQueries.getStudyAccess,
    preparationForAssistant: preparationQueries.preparationForAssistant,
  }
}
