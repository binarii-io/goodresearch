import type { Clock } from '@goodresearch/shared'
import type { Db } from '#platform/db.ts'
import { makeCreateProject } from '../application/commands/create-project.ts'
import { makeDeleteProject } from '../application/commands/delete-project.ts'
import { makeMoveProjectToTeam } from '../application/commands/move-project-to-team.ts'
import { makePreparationCommands } from '../application/commands/preparation-commands.ts'
import { makeQuestionnaireCommands } from '../application/commands/questionnaire-commands.ts'
import { makeRenameProject } from '../application/commands/rename-project.ts'
import { makeStudyCommands } from '../application/commands/study-commands.ts'
import { makeTestProtocolCommands } from '../application/commands/test-protocol-commands.ts'
import { makeUpdateProjectGoal } from '../application/commands/update-project-goal.ts'
import type {
  ProjectRunGate,
  ResearchCommandDeps,
  StudyActionGate,
  TeamDirectory,
  VideoProviderGate,
} from '../application/ports.ts'
import { makePreparationQueries } from '../application/queries/preparation-queries.ts'
import { makeProjectQueries, type TeamNames } from '../application/queries/project-queries.ts'
import {
  checkDraft,
  makeQuestionnaireQueries,
} from '../application/queries/questionnaire-queries.ts'
import { makeStudyQueries, type SourceSummaries } from '../application/queries/study-queries.ts'
import {
  checkTestProtocolDraft,
  makeTestProtocolQueries,
} from '../application/queries/test-protocol-queries.ts'
import type { ResearchHandlers } from './http.routes.ts'
import {
  drizzleGuideRepository,
  drizzlePlannedInterviewRepository,
} from './preparation.drizzle-repository.ts'
import { drizzleProjectRepository } from './project.drizzle-repository.ts'
import { drizzleQuestionnaireRepository } from './questionnaire.drizzle-repository.ts'
import { drizzleStudyRepository } from './study.drizzle-repository.ts'
import { drizzleTestProtocolRepository } from './test-protocol.drizzle-repository.ts'

export const createResearchModule = (deps: {
  db: Db
  clock: Clock
  teams: TeamDirectory
  teamNames: TeamNames
  /** Lazily bound: Synthesis is built after this one. */
  runs: () => ProjectRunGate
  /** Spec 038, lazily bound: the AI Gateway is built after this one. */
  video: () => VideoProviderGate
  /** Lazily bound: the ingestion module is built after this one. */
  ingestion: () => {
    gate: StudyActionGate
    sourceSummaries: SourceSummaries
    /** Spec 009 FR-022: the interview linked to a planned interview follows its changes. */
    plannedChanged: NonNullable<Parameters<typeof makePreparationCommands>[0]['plannedChanged']>
  }
}) => {
  const commandDeps: ResearchCommandDeps = {
    uow: (work) =>
      deps.db.transaction((tx) =>
        work({ projects: drizzleProjectRepository(tx), studies: drizzleStudyRepository(tx) }),
      ),
    clock: deps.clock,
    teams: deps.teams,
  }
  const queries = makeProjectQueries(deps)
  const studyQueries = makeStudyQueries({
    db: deps.db,
    teams: deps.teams,
    teamNames: deps.teamNames,
    sourceSummaries: (accountId, ids) => deps.ingestion().sourceSummaries(accountId, ids),
    folderOpen: (accountId, studyId) => deps.ingestion().gate.canRead(accountId, studyId),
  })
  const gate: StudyActionGate = {
    canAct: (accountId, studyId) => deps.ingestion().gate.canAct(accountId, studyId),
    canRead: (accountId, studyId) => deps.ingestion().gate.canRead(accountId, studyId),
  }
  const preparationQueries = makePreparationQueries({ db: deps.db, teams: deps.teams, gate })
  const questionnaireQueries = makeQuestionnaireQueries({ db: deps.db, teams: deps.teams, gate })
  const protocolQueries = makeTestProtocolQueries({ db: deps.db, teams: deps.teams, gate })
  const handlers: ResearchHandlers = {
    createProject: makeCreateProject(commandDeps),
    deleteProject: makeDeleteProject({
      ...commandDeps,
      runs: { isRunning: (projectId) => deps.runs().isRunning(projectId) },
    }),
    renameProject: makeRenameProject(commandDeps),
    updateProjectGoal: makeUpdateProjectGoal(commandDeps),
    moveProjectToTeam: makeMoveProjectToTeam(commandDeps),
    queries,
    studies: makeStudyCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      gate,
      runs: { isRunning: (projectId) => deps.runs().isRunning(projectId) },
      video: { readsVideo: (accountId) => deps.video().readsVideo(accountId) },
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
    questionnaires: makeQuestionnaireCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      questionnaires: drizzleQuestionnaireRepository(deps.db),
      gate,
    }),
    questionnaireQueries,
    protocols: makeTestProtocolCommands({
      ...commandDeps,
      studies: drizzleStudyRepository(deps.db),
      protocols: drizzleTestProtocolRepository(deps.db),
      gate,
    }),
    protocolQueries,
  }
  return {
    handlers,
    countProjectsByTeam: queries.countProjectsByTeam,
    countProjectsByTeams: queries.countProjectsByTeams,
    countStudiesByTeam: studyQueries.countStudiesByTeam,
    getStudyAccess: studyQueries.getStudyAccess,
    getStudyReadAccess: studyQueries.getStudyReadAccess,
    teamOfStudy: studyQueries.teamOfStudy,
    teamOfProject: queries.teamOfProject,
    studyOfPlanned: preparationQueries.studyOfPlanned,
    preparationForAssistant: preparationQueries.preparationForAssistant,
    questionnaireForAssistant: questionnaireQueries.questionnaireForAssistant,
    checkQuestionnaire: checkDraft,
    testProtocolForAssistant: protocolQueries.testProtocolForAssistant,
    checkTestProtocol: checkTestProtocolDraft,
  }
}
