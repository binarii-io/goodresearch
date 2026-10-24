import type { AppConfig } from '@goodresearch/config'
import { type Clock, systemClock } from '@goodresearch/shared'
import type { FastifyInstance } from 'fastify'
import { createAiGatewayModule, registerAiRoutes } from './modules/ai-gateway/index.ts'
import { createIngestionModule, registerIngestionRoutes } from './modules/ingestion/index.ts'
import { createResearchModule, registerResearchRoutes } from './modules/research/index.ts'
import { createWorkspaceModule, registerWorkspaceRoutes } from './modules/workspace/index.ts'
import { createAuth } from './platform/auth/auth.ts'
import { registerAuthRoutes } from './platform/auth/routes.ts'
import { createSessionGuard } from './platform/auth/session-guard.ts'
import type { Db } from './platform/db.ts'
import { buildApp } from './platform/http/app.ts'
import type { JobQueue } from './platform/jobs.ts'
import { loggerOptions } from './platform/logger.ts'

export type Infrastructure = {
  readonly db: Db
  readonly isReady: () => Promise<boolean>
  readonly clock?: Clock
  /** Job queue (pg-boss in the server); defaults to one that refuses every job. */
  readonly jobs?: JobQueue
  /** Replaces the Google Drive adapters (tests). */
  readonly drive?: Parameters<typeof createIngestionModule>[0]['drive']
  /** Replaces the model runner and Google Cloud API of the AI Gateway (tests). */
  readonly ai?: Pick<
    Parameters<typeof createAiGatewayModule>[0],
    'runner' | 'googleCloud' | 'googleFetch'
  >
}

const noJobs: JobQueue = { send: async () => false }

/** Wires the modules together; shared by the HTTP server and the worker. Connects nothing by itself. */
export const composeModules = (config: AppConfig, infra: Infrastructure) => {
  const clock = infra.clock ?? systemClock
  const jobs = infra.jobs ?? noJobs
  // Modules reference each other through ports; late binding breaks the construction cycle.
  let research: ReturnType<typeof createResearchModule> | undefined
  let ingestion: ReturnType<typeof createIngestionModule> | undefined
  let ai: ReturnType<typeof createAiGatewayModule> | undefined
  const bound = <T>(module: T | undefined): T => {
    if (!module) throw new Error('module not composed yet')
    return module
  }

  const workspace = createWorkspaceModule({
    db: infra.db,
    clock,
    rules: config.access,
    projects: () => ({
      countByTeam: bound(research).countProjectsByTeam,
      countByTeams: bound(research).countProjectsByTeams,
    }),
    aiProvider: () => bound(ai).providerGate,
    onAccountDeleted: () => bound(ai).forgetAccount,
  })
  research = createResearchModule({
    db: infra.db,
    clock,
    teams: { getAccessContext: workspace.getAccessContext, teamExists: workspace.teamExists },
    teamNames: workspace.teamNames,
    ingestion: () => bound(ingestion),
  })
  ingestion = createIngestionModule({
    db: infra.db,
    clock,
    config,
    studies: { getStudyAccess: research.getStudyAccess },
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
    ...(infra.drive !== undefined ? { drive: infra.drive } : {}),
  })
  ai = createAiGatewayModule({ db: infra.db, clock, config, ...(infra.ai ?? {}) })
  return { clock, workspace, research, ingestion, ai }
}

/** Composition root of the HTTP server: modules, auth and routes. */
export const composeApp = async (
  config: AppConfig,
  infra: Infrastructure,
  options: { logger?: boolean; rateLimit?: boolean } = {},
) => {
  const modules = composeModules(config, infra)
  const { clock, workspace, research, ingestion, ai } = modules
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
      registerIngestionRoutes(instance, { guard, handlers: ingestion.handlers })
      registerAiRoutes(instance, { guard, handlers: ai.handlers })
    },
  })
  return { app, auth, modules }
}
