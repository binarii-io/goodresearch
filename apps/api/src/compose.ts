import type { AppConfig } from '@goodresearch/config'
import { type Clock, systemClock } from '@goodresearch/shared'
import type { FastifyInstance } from 'fastify'
import { createResearchModule, registerResearchRoutes } from './modules/research/index.ts'
import { createWorkspaceModule, registerWorkspaceRoutes } from './modules/workspace/index.ts'
import { createAuth } from './platform/auth/auth.ts'
import { registerAuthRoutes } from './platform/auth/routes.ts'
import { createSessionGuard } from './platform/auth/session-guard.ts'
import type { Db } from './platform/db.ts'
import { buildApp } from './platform/http/app.ts'
import { loggerOptions } from './platform/logger.ts'

export type Infrastructure = {
  readonly db: Db
  readonly isReady: () => Promise<boolean>
  readonly clock?: Clock
}

/** Composition root: wires adapters, modules and routes. Connects nothing by itself. */
export const composeApp = async (
  config: AppConfig,
  infra: Infrastructure,
  options: { logger?: boolean; rateLimit?: boolean } = {},
) => {
  const clock = infra.clock ?? systemClock
  let research: ReturnType<typeof createResearchModule> | undefined
  const workspace = createWorkspaceModule({
    db: infra.db,
    clock,
    rules: config.access,
    projects: () => {
      if (!research) throw new Error('research module not composed yet')
      return {
        countByTeam: research.countProjectsByTeam,
        countByTeams: research.countProjectsByTeams,
      }
    },
  })
  research = createResearchModule({
    db: infra.db,
    clock,
    teams: { getAccessContext: workspace.getAccessContext, teamExists: workspace.teamExists },
    teamNames: workspace.teamNames,
  })
  const auth = createAuth({
    config,
    db: infra.db,
    gate: workspace.authGate,
    ...(options.rateLimit === undefined ? {} : { rateLimit: options.rateLimit }),
  })
  const guard = createSessionGuard({ auth, db: infra.db, clock })

  const app = await buildApp({
    logger: options.logger === false ? false : loggerOptions(config),
    trustProxy: config.trustedProxies,
    isReady: infra.isReady,
    register: (instance: FastifyInstance) => {
      registerAuthRoutes(instance, { auth, appUrl: config.appUrl, providers: config.providers })
      registerWorkspaceRoutes(instance, { guard, handlers: workspace.handlers })
      registerResearchRoutes(instance, { guard, handlers: research.handlers })
    },
  })
  return { app, auth }
}
