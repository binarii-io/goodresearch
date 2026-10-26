import type { AppConfig } from '@goodresearch/config'
import { type Clock, systemClock } from '@goodresearch/shared'
import type { FastifyInstance } from 'fastify'
import { createAiGatewayModule, registerAiRoutes } from './modules/ai-gateway/index.ts'
import {
  createAssistantModule,
  type ResearchActions,
  registerAssistantRoutes,
} from './modules/assistant/index.ts'
import {
  createAiAnalyzer,
  createIngestionModule,
  registerIngestionRoutes,
} from './modules/ingestion/index.ts'
import { createPublishingModule, registerPublishingRoutes } from './modules/publishing/index.ts'
import { createResearchModule, registerResearchRoutes } from './modules/research/index.ts'
import {
  createLexiconAi,
  createTranscriptsModule,
  registerTranscriptsRoutes,
} from './modules/transcripts/index.ts'
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
  let assistant: ReturnType<typeof createAssistantModule> | undefined
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
    onAccountDeleted: () => async (accountId: string) => {
      await bound(ai).forgetAccount(accountId)
      await bound(assistant).forgetAccount(accountId)
    },
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
    schedule: {
      // Fieldwork is shown only to people who can act on the study: same gate as the schedule.
      list: async (accountId, studyId) => {
        const planned = await bound(research).handlers.preparationQueries.listPlannedInterviews(
          accountId,
          studyId,
        )
        return planned.ok ? planned.value : null
      },
      // Spec 009 FR-022: through the schedule's own command (rules, version, Drive publishing).
      update: async (actor, studyId, plannedInterviewId, change) => {
        const r = bound(research).handlers
        const planned = await r.preparationQueries.listPlannedInterviews(actor.id, studyId)
        const row = planned.ok ? planned.value.find((p) => p.id === plannedInterviewId) : undefined
        if (!row) return false
        const scheduledAt = change.scheduledAt ?? row.scheduledAt
        const done = await r.preparation.updatePlannedInterview({
          actor,
          plannedInterviewId,
          fields: {
            interviewee: change.interviewee ?? row.interviewee,
            role: row.role,
            interviewers: change.interviewers ?? row.interviewers,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: row.status,
            notes: row.notes,
          },
          version: row.version,
        })
        return done.ok
      },
    },
    members: { exist: workspace.membersExist, ofTeam: workspace.membersOfTeam },
    analyzer: createAiAnalyzer({
      // Late binding: the AI gateway is built after ingestion.
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
    ...(infra.drive !== undefined ? { drive: infra.drive } : {}),
  })
  ai = createAiGatewayModule({ db: infra.db, clock, config, ...(infra.ai ?? {}) })
  const enrichment = ingestion.enrichment
  const transcripts = createTranscriptsModule({
    db: infra.db,
    clock,
    studies: { getStudyAccess: research.getStudyAccess },
    sources: {
      enrichmentSessions: enrichment.enrichmentSessions,
      readTranscript: enrichment.readTranscript,
      knownNames: enrichment.knownNames,
    },
    ai: createLexiconAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
  })
  const r = research.handlers
  // Results of research commands, as the assistant reads them (`ok` + id, or an error code).
  const outcome = <T extends object>(
    result: { ok: true; value: T } | { ok: false; error: string },
  ) =>
    result.ok ? { ok: true as const, ...result.value } : { ok: false as const, error: result.error }
  const actions: ResearchActions = {
    createProject: async (c) => outcome(await r.createProject(c)),
    updateProjectGoal: async (c) => outcome(await r.updateProjectGoal(c)),
    renameProject: async (c) => outcome(await r.renameProject(c)),
    createStudy: async (c) => outcome(await r.studies.createStudy({ ...c, type: 'interviews' })),
    renameStudy: async (c) => outcome(await r.studies.renameStudy(c)),
    saveGuide: async (c) =>
      outcome(
        await r.preparation.saveGuide({
          actor: c.actor,
          studyId: c.studyId,
          content: c.guide,
          version: c.version,
          origin: 'assistant',
        }),
      ),
  }
  assistant = createAssistantModule({
    db: infra.db,
    clock,
    gateway: ai.gateway,
    costs: ai.usageCosts,
    actions,
    research: {
      getProject: (accountId, id) => r.queries.getProject(accountId, id),
      listStudies: (accountId, id) => r.studyQueries.listStudies(accountId, id),
      getStudy: (accountId, id) => r.studyQueries.getStudy(accountId, id),
      teamsOf: async (accountId) => (await workspace.handlers.getMe(accountId))?.teams ?? [],
      listProjects: (accountId) => r.queries.listProjects(accountId, {}),
      preparation: (accountId, studyId) =>
        r.preparationQueries.preparationForAssistant(accountId, studyId),
    },
  })
  const at = (iso: string | null) => (iso ? new Date(iso) : null)
  const publishing = createPublishingModule({
    db: infra.db,
    clock,
    files: (accountId, studyId, access) => bound(ingestion).studyFiles(accountId, studyId, access),
    reads: {
      studyName: async (accountId, studyId) =>
        (await r.studyQueries.getStudy(accountId, studyId))?.name ?? null,
      guide: async (accountId, studyId) => {
        const guide = await r.preparationQueries.getGuide(accountId, studyId)
        if (!guide.ok) return guide
        return {
          ok: true as const,
          value: guide.value
            ? { content: guide.value.content, version: guide.value.version }
            : null,
        }
      },
      schedule: (accountId, studyId) =>
        r.preparationQueries.listPlannedInterviews(accountId, studyId),
    },
    actions: {
      saveGuide: async (c) => outcome(await r.preparation.saveGuide({ ...c, origin: 'drive' })),
      addPlanned: async (c) =>
        outcome(
          await r.preparation.addPlannedInterview({
            actor: c.actor,
            studyId: c.studyId,
            fields: { ...c.fields, scheduledAt: at(c.fields.scheduledAt) },
          }),
        ),
      updatePlanned: async (c) =>
        outcome(
          await r.preparation.updatePlannedInterview({
            actor: c.actor,
            plannedInterviewId: c.id,
            fields: { ...c.fields, scheduledAt: at(c.fields.scheduledAt) },
            version: c.version,
          }),
        ),
      deletePlanned: async (c) => {
        const done = await r.preparation.deletePlannedInterview({
          actor: c.actor,
          plannedInterviewId: c.id,
        })
        return done.ok ? { ok: true as const } : { ok: false as const, error: done.error }
      },
    },
  })
  return { clock, workspace, research, ingestion, ai, assistant, publishing, transcripts }
}

/** Composition root of the HTTP server: modules, auth and routes. */
export const composeApp = async (
  config: AppConfig,
  infra: Infrastructure,
  options: { logger?: boolean; rateLimit?: boolean } = {},
) => {
  const modules = composeModules(config, infra)
  const { clock, workspace, research, ingestion, ai, assistant, publishing, transcripts } = modules
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
      registerAssistantRoutes(instance, { guard, handlers: assistant.handlers })
      registerPublishingRoutes(instance, { guard, handlers: publishing.handlers })
      registerTranscriptsRoutes(instance, { guard, handlers: transcripts.handlers })
    },
  })
  return { app, auth, modules }
}
