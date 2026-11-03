import type { AppConfig } from '@goodresearch/config'
import { type Clock, maskBilingual, systemClock } from '@goodresearch/shared'
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
  interviewsStep,
  registerIngestionRoutes,
  splitNames,
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
  createSurveysModule,
  createThemesAi,
  figuresText,
  registerSurveysRoutes,
} from './modules/surveys/index.ts'
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
import { createAccessGuard, type OwnedKind } from './platform/http/change-guard.ts'
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
type IngestionListInterviews = ReturnType<
  typeof createIngestionModule
>['handlers']['sessionQueries']['listInterviews']

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
    studies: {
      getStudyAccess: research.getStudyAccess,
      getStudyReadAccess: research.getStudyReadAccess,
    },
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
      // Spec 026: outside the team, facts come from what is stored, with every name to mask.
      readerStudy: async (accountId, studyId) => {
        const access = await research.getStudyReadAccess(accountId, studyId)
        if (!access) return null
        if (access.relation === 'team') return { relation: 'team' }
        const closed = {
          relation: 'reader' as const,
          type: access.type,
          anonymised: access.anonymised,
          folderOpen: false,
          interviewIds: [],
          names: async () => [],
          themes: [],
        }
        if (!(await ingestion.gate.canRead(accountId, studyId))) return closed
        const [interviews, themes] = await Promise.all([
          ingestion.readerInterviews(studyId),
          r.preparationQueries.themesOf(studyId),
        ])
        return {
          ...closed,
          folderOpen: true,
          interviewIds: interviews.ids,
          names: () => readerKnownNames(studyId),
          themes,
        }
      },
    },
    ai: createFactsAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
      studyCosts: (refs) => bound(ai).studyCosts(refs),
    }),
    // Spec 029: Surveys is built later; its figures and themes are bound at call time.
    surveys: {
      figures: async (accountId, studyId, refs) => {
        const found = await bound(surveys).handlers.figures.figures(accountId, studyId, refs)
        return found.ok
          ? found
          : { ok: false, error: found.error as 'STUDY_NOT_FOUND' | 'NOT_A_SURVEY_STUDY' }
      },
      theme: (accountId, studyId, themeId) =>
        bound(surveys).handlers.themes.forFact(accountId, studyId, themeId),
      findingInput: async (accountId, studyId) => {
        const found = await bound(surveys).handlers.themes.forFinding(accountId, studyId)
        return found.ok
          ? found
          : { ok: false, error: found.error as 'STUDY_NOT_FOUND' | 'NOT_A_SURVEY_STUDY' }
      },
    },
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
  /** Spec 026: every name the app knows for a study, without a person's gate: to mask only. */
  const readerKnownNames = async (studyId: string): Promise<string[]> => {
    const team = await research.teamOfStudy(studyId)
    const [interviews, schedule, members, terms] = await Promise.all([
      ingestion.readerInterviews(studyId),
      r.preparationQueries.scheduleNames(studyId),
      team ? workspace.membersOfTeam(team.id) : [],
      team ? transcripts.teamPersonNames(team.id) : [],
    ])
    return [
      ...new Set([
        ...interviews.names,
        ...schedule.flatMap((p) => [p.interviewee, ...splitNames(p.interviewers)]),
        ...members.map((m) => m.name),
        ...terms,
      ]),
    ].filter((n) => n.trim().length > 0)
  }
  const teamKnownNames = async (accountId: string, studyId: string) => [
    ...(await enrichment.knownNames(accountId, studyId)),
    ...(await transcripts.personNames(accountId, studyId)),
  ]
  const teamInterviews = async (accountId: string, studyId: string) => {
    const interviews = (await enrichment.enrichmentSessions(accountId, studyId))?.sessions
    const dates = (interviews ?? [])
      .flatMap((s) => (s.interviewDate ? [s.interviewDate.slice(0, 10)] : []))
      .sort()
    return {
      count: interviews?.length ?? 0,
      first: dates[0] ?? null,
      last: dates.at(-1) ?? null,
    }
  }
  // Spec 013: the project's insights read the accepted facts of its studies through Evidence.
  const synthesis = createSynthesisModule({
    db: infra.db,
    clock,
    // Spec 026: what the queries read, for every active member. A reader gets no name.
    readSources: {
      project: async (accountId, projectId) => {
        const project = await r.queries.readProject(accountId, projectId)
        return project
          ? {
              teamId: project.team.id,
              goal: project.goal,
              name: project.name,
              team: project.team.name || null,
              canChange: project.canChange,
            }
          : null
      },
      // Spec 026 FR-012: a reader's facts rest on their access now, not on one recorded long ago.
      studies: async (accountId, projectId) =>
        Promise.all(
          ((await r.studyQueries.readStudies(accountId, projectId)) ?? []).map(async (s) => ({
            id: s.id,
            name: s.name,
            access:
              s.canChange || !s.hasFolder
                ? studyIsOpen(s)
                : await ingestion.gate.canRead(accountId, s.id),
            type: s.type,
            hasFolder: s.hasFolder,
          })),
        ),
      interviews: async (accountId, studyId) => {
        if (await research.getStudyAccess(accountId, studyId))
          return teamInterviews(accountId, studyId)
        return {
          count: (await ingestion.readerInterviews(studyId)).ids.length,
          first: null,
          last: null,
        }
      },
      // The caller only reads this to mask: no name reaches a reader by it.
      knownNames: async (accountId, studyId) =>
        (await research.getStudyAccess(accountId, studyId))
          ? teamKnownNames(accountId, studyId)
          : readerKnownNames(studyId),
    },
    sources: {
      project: async (accountId, projectId) => {
        const project = await r.queries.getProject(accountId, projectId)
        return project
          ? {
              teamId: project.team.id,
              goal: project.goal,
              name: project.name,
              team: project.team.name || null,
              canChange: true,
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
      knownNames: teamKnownNames,
      language: async (accountId) =>
        (await workspace.handlers.getMe(accountId))?.language === 'fr' ? 'fr' : 'en',
      // Spec 015: what the debrief deck says of a study, its verbatims and its Slides file.
      interviews: teamInterviews,
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
    createStudy: async (c) =>
      outcome(await r.studies.createStudy({ ...c, type: c.type ?? 'interviews' })),
    applyInterviewCard: async (c) =>
      outcome(
        await bound(ingestion).handlers.interviewWork.apply(
          c.actor,
          c.studyId,
          c.kind,
          c.lines,
          new Set(c.excluded),
          new Map(c.reasons.map((r) => [r.index, r.reason])),
        ),
      ),
    startAnalysis: async (c) => {
      const done = await bound(ingestion).handlers.analysis.startRun(c)
      return done.ok ? { ok: true as const } : { ok: false as const, error: String(done.error) }
    },
    applyFolderChanges: async (c) =>
      outcome(
        await bound(ingestion).handlers.folderWork.apply(
          c.actor,
          c.studyId,
          c.lines,
          new Set(c.excluded),
        ),
      ),
    publishPreparation: async (c) => {
      // What is left now: someone may have published one of them since the card was shown.
      const left = await publishing.handlers.queries.checkPublication(c)
      if (!left.ok) return { ok: false as const, error: String(left.error) }
      // The time zone is only read for the schedule, which the assistant does not publish.
      const done = await publishing.handlers.commands.publish({
        ...c,
        kinds: left.value.kinds,
        timeZone: 'UTC',
      })
      return done.ok ? { ok: true as const } : { ok: false as const, error: String(done.error) }
    },
    attachFolder: async (c) => {
      const done = await bound(ingestion).handlers.commands.attachFolder({ ...c, onlyIfNone: true })
      return done.ok ? { ok: true as const } : done
    },
    createTeamStudy: async (c) =>
      outcome(await r.studies.createTeamStudy({ ...c, type: c.type ?? 'interviews' })),
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
    setFormOpen: async (c) => {
      const done = await publishing.handlers.commands.setOpen(c)
      return done.ok ? { ok: true as const } : { ok: false as const, error: String(done.error) }
    },
    saveTargetRule: async (c) =>
      outcome(await bound(surveys).handlers.commands.saveRule({ ...c, origin: 'assistant' })),
    // Spec 029: each fact checked against today's figure, as from the Analysis tab.
    createSurveyFacts: async (c) => {
      let made = 0
      let first: string | null = null
      for (const { polarity, ...figure } of c.facts) {
        const done = await bound(evidence).handlers.surveyFacts.create(c.actor, c.studyId, {
          from: { figure },
          polarity,
        })
        if (done.ok) made++
        else first ??= String(done.error)
      }
      return made > 0
        ? { ok: true as const, made }
        : { ok: false as const, error: first ?? 'FIGURE_NOT_FOUND' }
    },
    startThemes: async (c) => {
      const done = await bound(surveys).handlers.themeCommands.start(
        c.actor,
        c.studyId,
        c.itemId,
        c.onlyNew,
      )
      return done.ok ? { ok: true as const } : { ok: false as const, error: String(done.error) }
    },
    saveQuestionnaire: async (c) =>
      outcome(
        await r.questionnaires.saveQuestionnaire({
          actor: c.actor,
          studyId: c.studyId,
          content: c.questionnaire,
          version: c.version,
          origin: 'assistant',
        }),
      ),
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
    studyCosts: ai.studyCosts,
    actions,
    research: {
      getProject: (accountId, id) => r.queries.getProject(accountId, id),
      listStudies: (accountId, id) => r.studyQueries.listStudies(accountId, id),
      getStudy: (accountId, id) => r.studyQueries.getStudy(accountId, id),
      readProject: (accountId, id) => r.queries.readProject(accountId, id),
      readStudies: (accountId, id) => r.studyQueries.readStudies(accountId, id),
      readStudy: (accountId, id) => r.studyQueries.readStudy(accountId, id),
      teamsOf: async (accountId) => (await workspace.handlers.getMe(accountId))?.teams ?? [],
      attachableStudies: async (accountId, teamId, projectId) =>
        (
          await r.studyQueries.listTeamStudies(
            accountId,
            teamId,
            projectId ? { notInProject: projectId } : {},
          )
        )?.studies.filter((s) => s.canAttach) ?? [],
      projectDeletion: async (accountId, projectId) => {
        const preview = await reporting.handlers.overviewQueries.deletion(accountId, projectId)
        return preview.ok ? preview.value : null
      },
      folderState: (actor, studyId) =>
        bound(ingestion).handlers.queries.folderState(actor, studyId),
      checkFolder: async (c) => outcome(await bound(ingestion).handlers.commands.checkFolder(c)),
      aiProvider: (accountId) => ai.gateway.providerOf(accountId),
      interviewCounts: async (actor, studyId) => {
        const done = await bound(ingestion).handlers.sessionQueries.interviewCounts(actor, studyId)
        return done.ok ? { ok: true as const, counts: done.value } : done
      },
      interviewsStep: async (actor, studyId) => {
        const done = await bound(ingestion).handlers.sessionQueries.interviewCounts(actor, studyId)
        return done.ok ? interviewsStep(done.value) : undefined
      },
      listInterviews: async (actor, studyId, search) => {
        const done = await bound(ingestion).handlers.sessionQueries.listInterviews(
          actor,
          studyId,
          search as Parameters<IngestionListInterviews>[2],
        )
        return done.ok ? { ok: true as const, page: done.value } : done
      },
      prepareInterviewCard: async (actor, studyId, kind, items) =>
        outcome(await bound(ingestion).handlers.interviewWork.prepare(actor, studyId, kind, items)),
      analysisEstimate: async (actor, studyId, again) => {
        const done = await bound(ingestion).handlers.analysis.estimate(actor, studyId, {
          all: again,
        })
        return done.ok
          ? { ok: true as const, ...done.value }
          : { ok: false as const, error: String(done.error) }
      },
      folderWorkAvailable: async (actor, studyId) => {
        const done = await bound(ingestion).handlers.folderWork.available(actor, studyId)
        return done.ok ? { ok: true as const } : done
      },
      browseFolder: async (actor, studyId, folderId) =>
        outcome(await bound(ingestion).handlers.folderWork.browse(actor, studyId, folderId)),
      findFiles: async (actor, studyId, search) =>
        outcome(await bound(ingestion).handlers.folderWork.find(actor, studyId, search)),
      readFile: async (actor, studyId, fileId, part) =>
        outcome(await bound(ingestion).handlers.folderWork.read(actor, studyId, fileId, part)),
      checkFolderChanges: async (actor, studyId, lines) =>
        outcome(await bound(ingestion).handlers.folderWork.check(actor, studyId, lines)),
      checkPublication: async (c) => {
        const done = await publishing.handlers.queries.checkPublication(c)
        return done.ok
          ? {
              ok: true as const,
              kinds: done.value.kinds as ('guide' | 'best-practices' | 'questionnaire')[],
            }
          : { ok: false as const, error: String(done.error) }
      },
      publishedKinds: (actor, studyId) =>
        publishing.handlers.queries.publishedKinds(actor, studyId),
      sourceConnected: async (accountId, access) =>
        (await bound(ingestion).handlers.queries.mySources({ id: accountId })).some(
          (s) => s.status === 'connected' && (access === 'read' || s.canWrite),
        ),
      studyInTeam: async (accountId, studyId, teamId) =>
        (await r.studyQueries.getStudy(accountId, studyId))?.team.id === teamId,
      canActOnStudy: (accountId, studyId) => bound(ingestion).gate.canAct(accountId, studyId),
      projectRunning: (projectId) => synthesis.overviewReads.isRunning(projectId),
      listProjects: (accountId) => r.queries.listProjects(accountId, {}),
      preparation: (accountId, studyId) =>
        r.preparationQueries.preparationForAssistant(accountId, studyId),
      questionnaire: (accountId, studyId) =>
        r.questionnaireQueries.questionnaireForAssistant(accountId, studyId),
      checkQuestionnaire: research.checkQuestionnaire,
      surveyProgress: async (accountId, studyId) => {
        const form = await publishing.formOfStudy(studyId)
        const seen = await bound(surveys).handlers.queries.progress(accountId, studyId)
        if (!seen.ok) return null
        return {
          publicationId: form?.id ?? null,
          accepting: form?.accepting === true,
          ...seen.value,
        }
      },
      // Spec 029: what the assistant reads of a survey's analysis: counts and figures only.
      surveyAnalysisState: async (accountId, studyId) => {
        const seen = await bound(surveys).handlers.figures.analysis(accountId, studyId, null)
        if (!seen.ok) return null
        const counts = await evidenceReads.surveyCounts(studyId)
        const of = (status: string) => counts.find((c) => c.status === status)?.count ?? 0
        return {
          counted: seen.value.counts.counted,
          setAside: seen.value.counts.setAside,
          openItems: seen.value.openItems.map(({ id, text, answers, themes, themed }) => ({
            id,
            text,
            answers,
            themes,
            themed,
          })),
          facts: {
            total: counts.reduce((n, c) => n + c.count, 0) - of('rejected'),
            toDecide: of('proposed'),
            accepted: of('accepted') + of('edited'),
          },
        }
      },
      surveyFigures: async (accountId, studyId, crossBy) => {
        const seen = await bound(surveys).handlers.figures.analysis(accountId, studyId, crossBy)
        return seen.ok ? figuresText(seen.value) : null
      },
      surveyFigureValues: async (accountId, studyId, refs) => {
        const seen = await bound(surveys).handlers.figures.figures(accountId, studyId, refs)
        if (!seen.ok) return refs.map(() => null)
        return seen.value.map((f) =>
          f
            ? {
                item: f.context.itemText,
                cross: f.snapshot.cross
                  ? `${f.context.crossItemText ?? ''}: ${f.snapshot.cross.option}`
                  : null,
                value: f.snapshot.value,
                base: f.snapshot.base,
                smallBase: f.snapshot.smallBase,
              }
            : null,
        )
      },
      themesEstimate: async (actor, studyId, itemId, onlyNew) => {
        const done = await bound(surveys).handlers.themeCommands.estimate(
          actor,
          studyId,
          itemId,
          onlyNew,
        )
        if (!done.ok) return { ok: false as const, error: String(done.error) }
        const seen = await bound(surveys).handlers.figures.analysis(actor.id, studyId, null)
        const text = seen.ok ? (seen.value.openItems.find((o) => o.id === itemId)?.text ?? '') : ''
        return { ok: true as const, text, ...done.value }
      },
      previewTargetRule: async (accountId, studyId, accepted) => {
        const done = await bound(surveys).handlers.queries.previewRule(accountId, studyId, accepted)
        return done.ok ? done.value : null
      },
    },
  })
  const at = (iso: string | null) => (iso ? new Date(iso) : null)
  let surveys: ReturnType<typeof createSurveysModule> | undefined
  const publishing = createPublishingModule({
    db: infra.db,
    clock,
    files: (accountId, studyId, access) => bound(ingestion).studyFiles(accountId, studyId, access),
    // Late binding: the responses need the published form.
    responses: {
      count: (studyId: string, fileId: string) => bound(surveys).responseCount(studyId, fileId),
      recordWordings: (
        studyId: string,
        wordings: readonly { itemId: string; text: string }[],
        until: Date,
      ) => bound(surveys).recordWordings(studyId, wordings, until),
    },
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
      questionnaire: async (accountId, studyId) => {
        const found = await r.questionnaireQueries.getQuestionnaire(accountId, studyId)
        if (!found.ok) return found
        return {
          ok: true as const,
          value: found.value
            ? { content: found.value.content, version: found.value.version }
            : null,
        }
      },
      schedule: (accountId, studyId) =>
        r.preparationQueries.listPlannedInterviews(accountId, studyId),
    },
    actions: {
      saveGuide: async (c) => outcome(await r.preparation.saveGuide({ ...c, origin: 'drive' })),
      saveQuestionnaire: async (c) =>
        outcome(await r.questionnaires.saveQuestionnaire({ ...c, origin: 'drive' })),
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

  const questionnaireOf = async (accountId: string, studyId: string) => {
    const found = await r.questionnaireQueries.getQuestionnaire(accountId, studyId)
    if (!found.ok) return found
    return {
      ok: true as const,
      value: found.value ? { content: found.value.content, version: found.value.version } : null,
    }
  }
  surveys = createSurveysModule({
    db: infra.db,
    clock,
    // The service refuses to list responses with a read-only grant, so reading needs the write one.
    files: (accountId, studyId) => bound(ingestion).studyFiles(accountId, studyId, 'write'),
    questionnaire: questionnaireOf,
    form: publishing.formOfStudy,
    costs: (refs) => bound(ai).studyCosts(refs),
    ai: createThemesAi({
      gateway: () => bound(ai).gateway,
      estimateCost: (...args) => bound(ai).estimateCost(...args),
    }),
    knownNames: (accountId, studyId) => teamKnownNames(accountId, studyId),
    enqueue: (queue, data, options) => jobs.send(queue, data, options),
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
        (await r.studyQueries.readTeamStudies(accountId, teamId, filter))?.studies.map((s) => ({
          id: s.id,
          access: studyIsOpen(s),
          type: s.type,
        })) ?? null,
      studies: async (accountId, projectId) =>
        (await r.studyQueries.readStudies(accountId, projectId))?.map((s) => ({
          id: s.id,
          access: studyIsOpen(s),
          type: s.type,
        })) ?? null,
      responseCounts: async (accountId, studyId) => {
        const progress = await bound(surveys).handlers.queries.progress(accountId, studyId)
        return progress.ok
          ? { received: progress.value.counts.total, counted: progress.value.counts.counted }
          : null
      },
      studyCounts: async (studyId) => {
        const interviews = await bound(ingestion).studyOverview(studyId)
        return {
          interviews: {
            validated: interviews.validated,
            proposed: interviews.proposed,
            excluded: interviews.excluded,
            participants: interviews.participants,
          },
          // Spec 029: a survey study's facts have no session; an interview study has none of them.
          facts: [
            ...(await evidenceReads.studyCounts(studyId, interviews.validatedSessionIds)),
            ...(await evidenceReads.surveyCounts(studyId)),
          ],
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
      takeawaysShown: async (accountId, projectId) => {
        const takeaways = await synthesis.overviewReads.takeaways(projectId)
        const project = await r.queries.readProject(accountId, projectId)
        if (!takeaways || !project || project.canChange) return takeaways
        const studies = (await r.studyQueries.readStudies(accountId, projectId)) ?? []
        // Every study: the takeaways reach a reader whatever their access to the folders.
        const lists = await Promise.all(studies.map((study) => readerKnownNames(study.id)))
        return { ...takeaways, text: maskBilingual(takeaways.text, lists.flat()) }
      },
      projectCostRefs: synthesis.overviewReads.costRefs,
      costs: (refs) => ai.studyCosts(refs),
    },
  })

  /** Spec 026: the team owning what a route names, for the access guard. */
  const ownerOf = async (kind: OwnedKind, id: string) => {
    if (kind === 'project') return research.teamOfProject(id)
    if (kind === 'team') {
      const team = (await workspace.teamNames([id])).get(id)
      return team === undefined ? null : { id, name: team }
    }
    const studyId =
      kind === 'study'
        ? id
        : kind === 'session'
          ? await ingestion.studyOfSession(id)
          : kind === 'publication'
            ? await publishing.studyOfPublication(id)
            : await research.studyOfPlanned(id)
    return studyId ? research.teamOfStudy(studyId) : null
  }

  return {
    ownerOf,
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
    surveys,
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
    surveys,
  } = modules
  const auth = createAuth({
    config,
    db: infra.db,
    gate: workspace.authGate,
    ...(options.rateLimit === undefined ? {} : { rateLimit: options.rateLimit }),
  })
  const guard = createAccessGuard({
    session: createSessionGuard({ auth, db: infra.db, clock }),
    access: workspace.getAccessContext,
    owner: modules.ownerOf,
  })

  const app = await buildApp({
    logger: options.logger === false ? false : loggerOptions(config),
    trustProxy: config.trustedProxies,
    isReady: infra.isReady,
    register: (instance: FastifyInstance) => {
      // Spec 026: refused before the input is validated, so that a refusal never depends on it.
      instance.addHook('onRoute', (route) => {
        if (route.preHandler !== guard) return
        route.preValidation = guard
        delete route.preHandler
      })
      registerAuthRoutes(instance, { auth, appUrl: config.appUrl, providers: config.providers })
      registerWorkspaceRoutes(instance, { guard, handlers: workspace.handlers })
      registerResearchRoutes(instance, { guard, handlers: research.handlers })
      registerIngestionRoutes(instance, { guard, handlers: ingestion.handlers })
      registerAiRoutes(instance, { guard, handlers: ai.handlers })
      registerAssistantRoutes(instance, { guard, handlers: assistant.handlers })
      registerPublishingRoutes(instance, { guard, handlers: publishing.handlers })
      registerSurveysRoutes(instance, { guard, handlers: surveys.handlers })
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
