import type { ReportingSources } from '../application/ports.ts'
import { makeOverviewQueries } from '../application/queries/overview-queries.ts'

/** Builds the reporting module: read models only, from the other modules' reads. */
export const createReportingModule = (deps: { sources: ReportingSources }) => ({
  handlers: { overviewQueries: makeOverviewQueries(deps) },
})

export type ReportingHandlers = ReturnType<typeof createReportingModule>['handlers']
