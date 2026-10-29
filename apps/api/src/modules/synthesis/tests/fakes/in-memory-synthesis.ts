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
} from '../../application/ports.ts'
import type { InsightRun } from '../../domain/insight-run.ts'
import type { Insight, InsightAnswer } from '../../domain/insights.ts'

/** The synthesis tables, in memory. */
export const inMemorySynthesisStore = () => {
  const runs = new Map<string, InsightRun>()
  const insights = new Map<string, Insight>()
  const consents = new Map<string, string>()
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
    hasConsent: async (a, p, provider) => consents.get(`${a}|${p}`) === provider,
    giveConsent: async (a, p, provider) => {
      consents.set(`${a}|${p}`, provider)
    },
    accountNames: async (ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
  }
  return { store, runs, insights }
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
  } = { unavailable: false, fail: 0, answer: null, during: null, translation: null }
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
          state.translation ? state.translation(k, v) : `[${request.to}] ${v}`,
        ]),
      )
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
    log: { warn: () => undefined },
  }
  return { deps, memory, queued, translations }
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
