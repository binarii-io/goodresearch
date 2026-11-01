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
  createEvidenceModule,
  createFactsAi,
  registerEvidenceRoutes,
} from './modules/evidence/index.ts'
import {
  createAiAnalyzer,
  createIngestionModule,
  registerIngestionRoutes,
} from './modules/ingestion/index.ts'
import {
  createInterviewQualityModule,
  createQualityAi,
  registerQualityRoutes,
} from './modules/interview-quality/index.ts'
import { createPublishingModule, registerPublishingRoutes } from './modules/publishing/index.ts'
import { createReportingModule, registerOverviewRoutes } from './modules/reporting/index.ts'
import { createResearchModule, registerResearchRoutes } from './modules/research/index.ts'
import {
  createInsightsAi,
  createSynthesisModule,
  registerDebriefRoutes,
  registerRecommendationRoutes,
  registerSynthesisRoutes,
} from './modules/synthesis/index.ts'
import {
  createCleaningAi,
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

/** A study with a folder is open only to people whose access was confirmed (spec 002 FR-010a). */
const studyIsOpen = (s: { hasFolder: boolean; folderName: string | null }) =>
  !s.hasFolder || s.folderName !== null

/** Wires the modules together; shared by the HTTP server and the worker. Connects nothing by itself. */
export const composeModules = (config: AppConfig, infra: Infrastructure) => {
  const clock = infra.clock ?? systemClock
  const jobs = infra.jobs ?? noJobs
  // Modules reference each other through ports; late binding breaks the construction cycle.
  let research: ReturnType<typeof createResearchModule> | undefined
  let ingestion: ReturnType<typeof createIngestionModule> | undefined
  let ai: ReturnType<typeof createAiGatewayModule> | undefined
  let assistant: ReturnType<typeof createAssistantModule> | undefined
  let evidence: ReturnType<typeof createEvidenceModule> | undefined
  let quality: ReturnType<typeof createInterviewQualityModule> | undefined
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
      countStudiesByTeam: bound(research).countStudiesByTeam,
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
    runs: () => ({ isRunning: (projectId) => synthesis.overviewReads.isRunning(projectId) }),
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
            status: change.status ?? row.status,
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
    cleaningAi: createCleaningAi({ gateway: () => bound(ai).gateway }),
    cleaningNames: enrichment.cleaningNames,
    // Spec 011: the clean transcripts go to a subfolder, with the person's own write access.
    cleanFiles: async (accountId, studyId) => {
      const files = await ingestion.studyFiles(accountId, studyId, 'write')
      if (!files.ok) return files
      const f = files.value
      return {
        ok: true,
        value: {
          ensureFolder: f.ensureFolder,
          createDocument: f.createDocumentIn,
          revision: f.revision,
          rewriteDocument: f.rewriteDocument,
          metadata: async (fileId) => {
            const meta = await f.metadata(fileId)
            return meta.ok && meta.value
              ? {
                  ok: true,
                  value: {
                    trashed: meta.value.trashed,
                    parents: meta.value.parents,
                    webViewLink: meta.value.webViewLink,
                  },
                }
              : meta.ok
                ? { ok: true, value: null }
                : meta
          },
        },
      }
    },
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
    // Spec 012: an Analysis run of the study waits for the Enrichment runs, and the reverse.
    factsLive: (studyId) => bound(evidence).factsLive(studyId),
    // Spec 016: so does a review of the interviews.
    qualityLive: (studyId) => bound(quality).qualityLive(studyId),
  })
  const r = research.handlers
  evidence = createEvidenceModule({
    db: infra.db,
    clock,
    sources: {
      studyAccess: (accountId, studyId) => research.getStudyAccess(accountId, studyId),
      sessions: async (accountId, studyId) =>
        (await enrichment.enrichmentSessions(accountId, studyId))?.sessions ?? null,
      people: async (accountId, studyId, options) =>
        (await enrichment.cleaningNames(accountId, studyId, options))?.people ?? null,
      knownNames: async (accountId, studyId) => [
        ...(await enrichment.knownNames(accountId, studyId)),
        ...(await transcripts.personNames(accountId, studyId)),
      ],
      analysedText: (accountId, studyId, sessionId, mode, options) =>
        transcripts.analysedText(accountId, studyId, sessionId, mode, options),
      importTranscripts: (accountId, studyId, sessionIds) =>
        transcripts.importTranscripts(accountId, studyId, sessionIds),
      // The study's research goal (spec 019) and the guide's theme sections (spec 012 research R12).
      context: async (accountId, studyId) => {
        const study = await r.studyQueries.getStudy(accountId, studyId)
        const guide = await r.preparationQueries.getGuide(accountId, studyId)
        const sections = guide.ok && guide.value ? guide.value.content.sections : []
        return {
          goal: study?.goal ?? '',
          themes: sections
            .filter((s) => s.kind === 'theme')
            .map((s) => ({ id: s.id, title: s.title })),
        }
      },
      enrichmentLive: (studyId) => transcripts.enrichmentLive(studyId),
      qualityLive: (studyId) => bound(quality).qualityLive(studyId),
    },
    ai: createFactsAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
  })
  const facts = evidence
  // Spec 016: how the interviews were conducted; it reads what Evidence reads, plus its attributions.
  quality = createInterviewQualityModule({
    db: infra.db,
    clock,
    sources: {
      studyAccess: (accountId, studyId) => research.getStudyAccess(accountId, studyId),
      sessions: async (accountId, studyId) =>
        (await enrichment.enrichmentSessions(accountId, studyId))?.sessions ?? null,
      people: async (accountId, studyId, options) =>
        (await enrichment.cleaningNames(accountId, studyId, { ...options, uncoded: true }))
          ?.people ?? null,
      knownNames: async (accountId, studyId) => [
        ...(await enrichment.knownNames(accountId, studyId)),
        ...(await transcripts.personNames(accountId, studyId)),
      ],
      analysedText: (accountId, studyId, sessionId, mode, options) =>
        transcripts.analysedText(accountId, studyId, sessionId, mode, options),
      importTranscripts: (accountId, studyId, sessionIds) =>
        transcripts.importTranscripts(accountId, studyId, sessionIds),
      context: async (accountId, studyId) => {
        const study = await r.studyQueries.getStudy(accountId, studyId)
        const guide = await r.preparationQueries.getGuide(accountId, studyId)
        const sections = guide.ok && guide.value ? guide.value.content.sections : []
        return {
          goal: study?.goal ?? '',
          guide: sections.flatMap((s) => s.questions.map((q) => q.text)),
        }
      },
      speakerAttributions: (sessionId) => facts.speakerAttributions(sessionId),
      enrichmentLive: (studyId) => transcripts.enrichmentLive(studyId),
      factsLive: (studyId) => facts.factsLive(studyId),
    },
    ai: createQualityAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
  })
  const evidenceReads = evidence.reads
  // Spec 013: the project's insights read the accepted facts of its studies through Evidence.
  const synthesis = createSynthesisModule({
    db: infra.db,
    clock,
    sources: {
      project: async (accountId, projectId) => {
        const project = await r.queries.getProject(accountId, projectId)
        return project
          ? {
              teamId: project.team.id,
              goal: project.goal,
              name: project.name,
              team: project.team.name || null,
            }
          : null
      },
      studies: async (accountId, projectId) =>
        ((await r.studyQueries.listStudies(accountId, projectId)) ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          access: studyIsOpen(s),
          type: s.type,
          hasFolder: s.hasFolder,
        })),
      themes: async (accountId, studyId) => {
        const guide = await r.preparationQueries.getGuide(accountId, studyId)
        const sections = guide.ok && guide.value ? guide.value.content.sections : []
        return sections.filter((s) => s.kind === 'theme').map((s) => ({ id: s.id, title: s.title }))
      },
      facts: (studyIds) => evidenceReads.projectFacts(studyIds),
      factsByIds: (ids) => evidenceReads.factsByIds(ids),
      knownNames: async (accountId, studyId) => [
        ...(await enrichment.knownNames(accountId, studyId)),
        ...(await transcripts.personNames(accountId, studyId)),
      ],
      language: async (accountId) =>
        (await workspace.handlers.getMe(accountId))?.language === 'fr' ? 'fr' : 'en',
      // Spec 015: what the debrief deck says of a study, its verbatims and its Slides file.
      interviews: async (accountId, studyId) => {
        const interviews = (await enrichment.enrichmentSessions(accountId, studyId))?.sessions
        const dates = (interviews ?? [])
          .flatMap((s) => (s.interviewDate ? [s.interviewDate.slice(0, 10)] : []))
          .sort()
        return {
          count: interviews?.length ?? 0,
          first: dates[0] ?? null,
          last: dates.at(-1) ?? null,
        }
      },
      guide: async (accountId, studyId) => {
        const guide = await r.preparationQueries.getGuide(accountId, studyId)
        const sections = guide.ok && guide.value ? guide.value.content.sections : []
        return {
          themes: sections.filter((s) => s.kind === 'theme').map((s) => s.title),
          questions: sections.reduce((n, s) => n + s.questions.length, 0),
        }
      },
      verbatims: (factIds) => evidenceReads.verbatimsOf(factIds),
      deckFiles: async (accountId, studyId) => {
        const files = await ingestion.studyFiles(accountId, studyId, 'write')
        if (!files.ok) return files
        const f = files.value
        return {
          ok: true,
          value: {
            folderId: f.folderId,
            createPresentation: f.createPresentation,
            rewritePresentation: f.rewritePresentation,
            metadata: async (fileId) => {
              const meta = await f.metadata(fileId)
              return meta.ok && meta.value
                ? {
                    ok: true,
                    value: {
                      trashed: meta.value.trashed,
                      canEdit: meta.value.canEdit,
                      ownerName: meta.value.ownerName,
                      version: meta.value.version,
                      webViewLink: meta.value.webViewLink,
                    },
                  }
                : meta.ok
                  ? { ok: true, value: null }
                  : meta
            },
          },
        }
      },
    },
    ai: createInsightsAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
  })
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
    deleteProject: async (c) => {
      const done = await r.deleteProject(c)
      return done.ok ? { ok: true as const } : done
    },
    attachStudy: async (c) => {
      const done = await r.studies.attachStudy(c)
      return done.ok ? { ok: true as const } : done
    },
    detachStudy: async (c) => {
      const done = await r.studies.detachStudy(c)
      return done.ok ? { ok: true as const } : done
    },
    updateStudyGoal: async (c) => outcome(await r.studies.updateStudyGoal(c)),
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
      attachableStudies: async (accountId, teamId, projectId) =>
        (
          await r.studyQueries.listTeamStudies(accountId, teamId, { notInProject: projectId })
        )?.studies.filter((s) => s.canAttach) ?? [],
      projectDeletion: async (accountId, projectId) => {
        const preview = await reporting.handlers.overviewQueries.deletion(accountId, projectId)
        return preview.ok ? preview.value : null
      },
      studyFolder: async (accountId, studyId) =>
        (await bound(ingestion).sourceSummaries(accountId, [studyId])).get(studyId)?.folderName ??
        null,
      studyInTeam: async (accountId, studyId, teamId) =>
        (await r.studyQueries.getStudy(accountId, studyId))?.team.id === teamId,
      canActOnStudy: (accountId, studyId) => bound(ingestion).gate.canAct(accountId, studyId),
      projectRunning: (projectId) => synthesis.overviewReads.isRunning(projectId),
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

  // Spec 017: read models across the modules, built after all of them.
  const reporting = createReportingModule({
    sources: {
      canDelete: async (accountId, projectId) =>
        (await r.queries.getProject(accountId, projectId))?.canDelete ?? null,
      linkedStudies: async (accountId, projectId) =>
        ((await r.studyQueries.listStudies(accountId, projectId)) ?? []).map((s) => ({
          otherProjects: s.alsoIn.length,
        })),
      hasPublishedDeck: synthesis.overviewReads.hasPublishedDeck,
      teamStudies: async (accountId, teamId, filter) =>
        (await r.studyQueries.listTeamStudies(accountId, teamId, filter))?.studies.map((s) => ({
          id: s.id,
          access: s.canAttach,
        })) ?? null,
      studies: async (accountId, projectId) =>
        (await r.studyQueries.listStudies(accountId, projectId))?.map((s) => ({
          id: s.id,
          access: studyIsOpen(s),
        })) ?? null,
      studyCounts: async (studyId) => {
        const interviews = await bound(ingestion).studyOverview(studyId)
        return {
          interviews: {
            validated: interviews.validated,
            proposed: interviews.proposed,
            excluded: interviews.excluded,
            participants: interviews.participants,
          },
          facts: await evidenceReads.studyCounts(studyId, interviews.validatedSessionIds),
        }
      },
      studyCostRefs: async (studyId) => {
        const interviews = await bound(ingestion).studyCostRefs(studyId)
        const [facts, costRefs, quality_] = await Promise.all([
          evidenceReads.studyCostRefs(studyId, interviews.sessionIds),
          transcripts.studyCostRefs(studyId),
          bound(quality).studyCostRefs(studyId),
        ])
        return {
          analysis: interviews.analysisRefs,
          lexicon: costRefs.lexicon,
          cleaning: costRefs.cleaning,
          quality: quality_,
          facts,
        }
      },
      insightCounts: synthesis.overviewReads.insightCounts,
      recommendationCounts: synthesis.overviewReads.recommendationCounts,
      takeaways: synthesis.overviewReads.takeaways,
      projectCostRefs: synthesis.overviewReads.costRefs,
      costs: (refs) => ai.studyCosts(refs),
    },
  })

  return {
    clock,
    workspace,
    research,
    ingestion,
    ai,
    assistant,
    publishing,
    transcripts,
    evidence,
    quality,
    synthesis,
    reporting,
  }
}

/** Composition root of the HTTP server: modules, auth and routes. */
export const composeApp = async (
  config: AppConfig,
  infra: Infrastructure,
  options: { logger?: boolean; rateLimit?: boolean } = {},
) => {
  const modules = composeModules(config, infra)
  const {
    clock,
    workspace,
    research,
    ingestion,
    ai,
    assistant,
    publishing,
    transcripts,
    evidence,
    quality,
    synthesis,
    reporting,
  } = modules
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
      registerEvidenceRoutes(instance, { guard, handlers: evidence.handlers })
      registerQualityRoutes(instance, { guard, handlers: quality.handlers })
      registerSynthesisRoutes(instance, { guard, handlers: synthesis.handlers })
      registerRecommendationRoutes(instance, { guard, handlers: synthesis.handlers })
      registerDebriefRoutes(instance, { guard, handlers: synthesis.handlers })
      registerOverviewRoutes(instance, { guard, handlers: reporting.handlers })
    },
  })
  return { app, auth, modules }
}
