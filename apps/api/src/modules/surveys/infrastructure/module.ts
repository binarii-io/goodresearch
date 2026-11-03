import type { Db } from '#platform/db.ts'
import { makeSurveyCommands } from '../application/commands/survey-commands.ts'
import type { SurveysDeps } from '../application/ports.ts'
import { makeResponseQueries } from '../application/queries/response-queries.ts'
import type { SurveysHandlers } from './http.routes.ts'
import { createSurveysStore } from './surveys.drizzle-store.ts'

/** The responses of survey studies (spec 028, ADR-0011). */
export const createSurveysModule = (deps: Omit<SurveysDeps, 'store'> & { db: Db }) => {
  const store = createSurveysStore(deps.db)
  const wired = { ...deps, store }
  const handlers: SurveysHandlers = {
    commands: makeSurveyCommands(wired),
    queries: makeResponseQueries(wired),
  }
  return {
    handlers,
    responseCount: store.count,
    recordWordings: store.recordWordings,
  }
}
