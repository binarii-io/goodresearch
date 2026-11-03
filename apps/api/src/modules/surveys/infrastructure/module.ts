import { inArray } from 'drizzle-orm'
import { z } from 'zod'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { type JobHandler, QUEUES } from '#platform/jobs.ts'
import { makeSurveyCommands } from '../application/commands/survey-commands.ts'
import { makeThemeCommands } from '../application/commands/theme-commands.ts'
import type { SurveysDeps, ThemesAi } from '../application/ports.ts'
import { makeFigureQueries } from '../application/queries/figure-queries.ts'
import { makeResponseQueries } from '../application/queries/response-queries.ts'
import { makeThemeQueries } from '../application/queries/theme-queries.ts'
import type { SurveysHandlers } from './http.routes.ts'
import { createSurveysStore } from './surveys.drizzle-store.ts'
import { createThemeStore } from './themes.drizzle-store.ts'

const ThemesJobPayload = z.object({
  runId: z.string().min(1),
  studyId: z.string().min(1),
  accountId: z.string().min(1),
  onlyNew: z.boolean().default(false),
})
const ThemeTranslationPayload = z.object({
  themeId: z.string().min(1),
  version: z.number().int(),
  accountId: z.string().min(1),
  from: z.enum(['en', 'fr']),
  fields: z.array(z.enum(['label', 'description'])).default(['label', 'description']),
})

/** The responses of survey studies (spec 028, ADR-0011), and their analysis (spec 029). */
export const createSurveysModule = (
  deps: Omit<SurveysDeps, 'store'> & {
    db: Db
    ai: ThemesAi
    /** Names the team knows: masked before anything is sent (ADR-0012). */
    knownNames: (accountId: string, studyId: string) => Promise<readonly string[]>
    enqueue: (queue: string, data: object, options?: { singletonKey?: string }) => Promise<boolean>
    log?: { warn(object: object, message: string): void }
  },
) => {
  const store = createSurveysStore(deps.db)
  const themes = createThemeStore(deps.db)
  const log = deps.log ?? console
  const accountNames = async (ids: readonly string[]) =>
    new Map(
      ids.length === 0
        ? []
        : (
            await deps.db
              .select({ id: auth_users.id, name: auth_users.name })
              .from(auth_users)
              .where(inArray(auth_users.id, [...ids]))
          ).map((u) => [u.id, u.name]),
    )
  const wired = { ...deps, store, themes, log, accountNames }
  const themeCommands = makeThemeCommands({
    ...wired,
    // One theme run per study at a time (research R6).
    enqueueRun: (job) => deps.enqueue(QUEUES.themes, job, { singletonKey: job.studyId }),
    enqueueTranslation: (job) => deps.enqueue(QUEUES.surveyTranslate, job),
  })
  const handlers: SurveysHandlers = {
    commands: makeSurveyCommands(wired),
    queries: makeResponseQueries(wired),
    figures: makeFigureQueries(wired),
    themes: makeThemeQueries(wired),
    themeCommands,
  }
  const jobs: JobHandler[] = [
    {
      queue: QUEUES.themes,
      handle: async (data) => {
        // Job payloads cross a process boundary: validate them (AGENTS.md).
        const job = ThemesJobPayload.safeParse(data)
        if (!job.success)
          return log.warn({ issues: job.error.issues }, 'invalid themes job ignored')
        return themeCommands.runJob(job.data)
      },
    },
    {
      queue: QUEUES.surveyTranslate,
      handle: async (data) => {
        const job = ThemeTranslationPayload.safeParse(data)
        if (!job.success)
          return log.warn({ issues: job.error.issues }, 'invalid translation job ignored')
        return themeCommands.translateJob(job.data)
      },
    },
  ]
  return {
    handlers,
    jobs,
    responseCount: store.count,
    recordWordings: store.recordWordings,
  }
}
