import type { Clock } from '@goodresearch/shared'
import {
  AiUnavailable,
  type InsightRequest,
  type InsightsAi,
  type InsightsJob,
  type InsightTranslateJob,
  type ProjectStudy,
  type SourceFact,
  type SynthesisDeps,
  type SynthesisSources,
  type SynthesisStore,
  type TakeawaysJob,
} from '../../application/ports.ts'
import type { InsightRun, RecommendationRun } from '../../domain/insight-run.ts'
import type { Insight, InsightAnswer } from '../../domain/insights.ts'
import type { Recommendation, RecommendationAnswer } from '../../domain/recommendations.ts'
import type { Takeaways } from '../../domain/takeaways.ts'

/** The synthesis tables, in memory. */
export const inMemorySynthesisStore = () => {
  const runs = new Map<string, InsightRun>()
  const insights = new Map<string, Insight>()
  const consents = new Map<string, string>()
  const recRuns = new Map<string, RecommendationRun>()
  const recommendations = new Map<string, Recommendation>()
  const takeaways = new Map<string, Takeaways>()
  const blank = (projectId: string): Takeaways => ({
    projectId,
    text: { en: '', fr: '' },
    translation: 'done',
    pendingTranslation: null,
    savedBy: null,
    savedAt: null,
    version: 0,
    savedOver: null,
    withProposed: false,
    draft: { text: null, state: 'none', by: null, at: null, withProposed: false },
  })
  const store: SynthesisStore = {
    openRun: async (projectId) =>
      [...runs.values()].find((r) => r.projectId === projectId && r.finishedAt === null) ?? null,
    runsOf: async (projectId) =>
      [...runs.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    getRun: async (id) => runs.get(id) ?? null,
    startRun: async (run) => {
      if ([...runs.values()].some((r) => r.projectId === run.projectId && r.finishedAt === null))
        return false
      runs.set(run.id, run)
      return true
    },
    saveRun: async (run) => {
      const current = runs.get(run.id)
      if (!current || current.finishedAt) return
      runs.set(run.id, { ...run, stopRequested: run.stopRequested || current.stopRequested })
    },
    requestStop: async (runId) => {
      const current = runs.get(runId)
      if (current) runs.set(runId, { ...current, stopRequested: true })
    },
    insightsOf: async (projectId) =>
      [...insights.values()].filter((i) => i.projectId === projectId),
    getInsight: async (id) => insights.get(id) ?? null,
    saveInsight: async (insight, expected) => {
      const current = insights.get(insight.id)
      if (expected === null ? current : current?.version !== expected) return 'stale'
      insights.set(insight.id, insight)
      return 'ok'
    },
    applyRun: async ({ creates, updates }) => {
      let skipped = 0
      for (const i of creates) insights.set(i.id, i)
      for (const u of updates) {
        if (insights.get(u.insight.id)?.version !== u.expected) skipped++
        else insights.set(u.insight.id, u.insight)
      }
      return { skipped }
    },
    openRecommendationRun: async (projectId) =>
      [...recRuns.values()].find((r) => r.projectId === projectId && r.finishedAt === null) ?? null,
    recommendationRunsOf: async (projectId) =>
      [...recRuns.values()]
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    getRecommendationRun: async (id) => recRuns.get(id) ?? null,
    startRecommendationRun: async (run) => {
      if ([...recRuns.values()].some((r) => r.projectId === run.projectId && r.finishedAt === null))
        return false
      recRuns.set(run.id, run)
      return true
    },
    saveRecommendationRun: async (run) => {
      const current = recRuns.get(run.id)
      if (!current || current.finishedAt) return
      recRuns.set(run.id, { ...run, stopRequested: run.stopRequested || current.stopRequested })
    },
    requestRecommendationStop: async (runId) => {
      const current = recRuns.get(runId)
      if (current) recRuns.set(runId, { ...current, stopRequested: true })
    },
    recommendationsOf: async (projectId) =>
      [...recommendations.values()].filter((r) => r.projectId === projectId),
    getRecommendation: async (id) => recommendations.get(id) ?? null,
    saveRecommendation: async (r, expected) => {
      const current = recommendations.get(r.id)
      if (expected === null ? current : current?.version !== expected) return 'stale'
      recommendations.set(r.id, r)
      return 'ok'
    },
    applyRecommendations: async ({ creates, updates }) => {
      let skipped = 0
      for (const r of creates) recommendations.set(r.id, r)
      for (const u of updates) {
        if (recommendations.get(u.recommendation.id)?.version !== u.expected) skipped++
        else recommendations.set(u.recommendation.id, u.recommendation)
      }
      return { skipped }
    },
    getTakeaways: async (projectId) => takeaways.get(projectId) ?? null,
    saveTakeaways: async (t, expected) => {
      const current = takeaways.get(t.projectId) ?? blank(t.projectId)
      if (current.version !== expected) return 'stale'
      takeaways.set(t.projectId, { ...t, draft: current.draft })
      return 'ok'
    },
    saveDraft: async (projectId, draft) => {
      takeaways.set(projectId, { ...(takeaways.get(projectId) ?? blank(projectId)), draft })
    },
    hasConsent: async (a, p, provider) => consents.get(`${a}|${p}`) === provider,
    giveConsent: async (a, p, provider) => {
      consents.set(`${a}|${p}`, provider)
    },
    accountNames: async (ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
  }
  return { store, runs, insights, recRuns, recommendations, takeaways }
}

/** The other modules, as Synthesis sees them. */
export const fakeSources = (input: {
  studies: ProjectStudy[]
  facts: SourceFact[]
  goal?: string
  names?: string[]
  themes?: Record<string, { id: string; title: string }[]>
  access?: (accountId: string) => boolean
}) => {
  const state = { facts: input.facts, studies: input.studies, language: 'en' as 'en' | 'fr' }
  const allowed = input.access ?? (() => true)
  const sources: SynthesisSources = {
    project: async (accountId) =>
      allowed(accountId) ? { teamId: 'team', goal: input.goal ?? 'How teams find data' } : null,
    studies: async () => state.studies,
    themes: async (_a, studyId) => input.themes?.[studyId] ?? [],
    facts: async (studyIds) =>
      state.facts.filter((f) => studyIds.includes(f.studyId) && f.status !== 'rejected'),
    factsByIds: async (ids) => ids.flatMap((id) => state.facts.find((f) => f.id === id) ?? []),
    knownNames: async () => input.names ?? [],
    language: async () => state.language,
  }
  return { sources, state }
}

/**
 * The AI, as the fake runner of the gateway answers (quickstart): one insight per theme sent,
 * supported by its negative facts and countered by its positive ones, plus one citing a fact not
 * sent (the app must drop the reference).
 */
export const fakeInsightsAi = () => {
  const requests: { kind: string; ref: string; body: InsightRequest | object }[] = []
  const state: {
    unavailable: boolean
    fail: number
    answer: InsightAnswer[] | null
    /** Runs while a call is in flight (a person acting meanwhile). */
    during: (() => Promise<void>) | null
    /** Replaces the translation of one text. */
    translation: ((field: string, text: string) => string) | null
    recommendations: RecommendationAnswer[] | null
  } = {
    unavailable: false,
    fail: 0,
    answer: null,
    during: null,
    translation: null,
    recommendations: null,
  }
  const ai: InsightsAi = {
    insights: async (_a, ref, request) => {
      requests.push({ kind: 'insights', ref, body: request })
      if (state.during) await state.during()
      if (state.unavailable) throw new AiUnavailable()
      if (state.fail > 0) {
        state.fail--
        throw new Error('provider failed')
      }
      if (state.answer) return state.answer
      const lines = request.facts.map((l) => l.split(' | '))
      const themes = [...new Set(lines.map((l) => l[2] ?? 'other'))]
      return themes.map((theme) => ({
        theme,
        statement: { en: `Finding about ${theme}`, fr: `Constat sur ${theme}` },
        description: { en: 'What the facts say. About 40% agree.', fr: 'Ce que disent les faits.' },
        counterEvidence: { en: 'None', fr: 'Aucun' },
        minorityView: { en: 'None', fr: 'Aucun' },
        support: [
          ...lines.filter((l) => l[2] === theme && l[1] !== 'positive').map((l) => l[0] ?? ''),
          'f999',
        ],
        counter: lines.filter((l) => l[2] === theme && l[1] === 'positive').map((l) => l[0] ?? ''),
      }))
    },
    translate: async (_a, ref, request) => {
      requests.push({ kind: 'translate', ref, body: request })
      if (state.during) await state.during()
      if (state.unavailable) throw new AiUnavailable()
      return Object.fromEntries(
        Object.entries(request.texts).map(([k, v]) => [
          k,
          state.translation ? state.translation(k, v ?? '') : `[${request.to}] ${v}`,
        ]),
      )
    },
    recommendations: async (_a, ref, request) => {
      requests.push({ kind: 'recommendations', ref, body: request })
      if (state.during) await state.during()
      if (state.unavailable) throw new AiUnavailable()
      if (state.recommendations) return state.recommendations
      // One recommendation per insight line: a build, plus one citing an insight not sent.
      return [
        ...request.insights.map((line) => {
          const parts = line.split(' | ')
          const ref = parts[0] ?? 'i1'
          const statement = parts.at(-1) ?? ''
          return {
            action: { en: `Act on: ${statement}`, fr: `Agir sur : ${statement}` },
            rationale: { en: 'Because the insight says so.', fr: "Parce que l'insight le dit." },
            kind: 'build' as const,
            impact: 'high' as const,
            effort: 'medium' as const,
            successMeasure: { en: 'Fewer issues', fr: 'Moins de problèmes' },
            insights: [ref],
          }
        }),
        {
          action: { en: 'Unsupported', fr: 'Sans appui' },
          rationale: { en: '', fr: '' },
          kind: 'test' as const,
          impact: 'low' as const,
          effort: 'low' as const,
          successMeasure: { en: '', fr: '' },
          insights: ['i999'],
        },
      ]
    },
    takeaways: async (_a, ref, request) => {
      requests.push({ kind: 'takeaways', ref, body: request })
      if (state.unavailable) throw new AiUnavailable()
      return [
        { en: 'Teams lose time finding data.', fr: 'Les équipes perdent du temps.' },
        { en: 'About 40% rebuild reports.', fr: 'Environ 40 % refont des rapports.' },
        { en: 'A shared catalogue would help.', fr: 'Un catalogue partagé aiderait.' },
      ]
    },
    providerOf: async () => 'anthropic',
    estimate: async (_a, chars) => chars / 1_000_000,
    costs: async (refs) => new Map(refs.map((r) => [r, r.startsWith('insights:') ? 0.05 : 0.01])),
  }
  return { ai, requests, state }
}

export const makeDeps = (input: { sources: SynthesisSources; ai: InsightsAi; clock: Clock }) => {
  const memory = inMemorySynthesisStore()
  const queued: InsightsJob[] = []
  const translations: InsightTranslateJob[] = []
  const recommendationJobs: InsightsJob[] = []
  const takeawaysJobs: TakeawaysJob[] = []
  const deps: SynthesisDeps = {
    store: memory.store,
    sources: input.sources,
    ai: input.ai,
    clock: input.clock,
    enqueueRun: async (job) => {
      queued.push(job)
      return true
    },
    enqueueTranslation: async (job) => {
      translations.push(job)
      return true
    },
    enqueueRecommendations: async (job) => {
      recommendationJobs.push(job)
      return true
    },
    enqueueTakeaways: async (job) => {
      takeawaysJobs.push(job)
      return true
    },
    log: { warn: () => undefined },
  }
  return { deps, memory, queued, translations, recommendationJobs, takeawaysJobs }
}

/** An accepted fact of study `st`, interview `s-<participant>`. */
export const sourceFact = (
  id: string,
  participant: string,
  over: Partial<SourceFact> = {},
): SourceFact => ({
  id,
  studyId: 'st',
  sessionId: `s-${participant}`,
  status: 'accepted',
  participants: [participant],
  polarity: 'negative',
  theme: { id: 'g1', title: 'Finding data' },
  statement: {
    en: `Cannot find the data (${participant})`,
    fr: `Ne trouve pas les données (${participant})`,
  },
  version: 1,
  ...over,
})
