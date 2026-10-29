import type { Clock } from '@goodresearch/shared'
import type {
  AnalysedText,
  AnalysisSources,
  EvidenceDeps,
  EvidenceStore,
  FactAnswer,
  FactsAi,
  FactsJob,
  Reading,
  StoredVerbatim,
  TranslateJob,
  VerbatimRequest,
} from '../../application/ports.ts'
import { AiUnavailable } from '../../application/ports.ts'
import { canStopFacts, type FactsRun } from '../../domain/analysis-run.ts'
import type { TextAnalysed } from '../../domain/analysis-state.ts'
import type { Fact } from '../../domain/facts.ts'
import type { Person } from '../../domain/speakers.ts'

/** The evidence tables, in memory. */
export const inMemoryEvidenceStore = () => {
  const runs = new Map<string, FactsRun>()
  const readings = new Map<string, Reading>()
  const verbatims = new Map<string, StoredVerbatim>()
  const facts = new Map<string, Fact>()
  const speakers = new Map<string, Map<string, string>>()
  const consents = new Set<string>()
  const setAsideOne = (id: string) => {
    const v = verbatims.get(id)
    if (!v) return
    verbatims.set(id, { ...v, setAside: true })
    for (const f of facts.values())
      if (f.status === 'proposed' && f.verbatimIds.includes(id)) {
        const left = f.verbatimIds.filter((x) => x !== id)
        if (left.length === 0) facts.delete(f.id)
        else facts.set(f.id, { ...f, verbatimIds: left, version: f.version + 1 })
      }
  }
  const store: EvidenceStore = {
    openRun: async (studyId) =>
      [...runs.values()].find((r) => r.studyId === studyId && r.finishedAt === null) ?? null,
    runsOf: async (studyId) =>
      [...runs.values()]
        .filter((r) => r.studyId === studyId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    getRun: async (id) => runs.get(id) ?? null,
    startRun: async (run) => {
      if ([...runs.values()].some((r) => r.studyId === run.studyId && r.finishedAt === null))
        return false
      runs.set(run.id, run)
      return true
    },
    saveRun: async (run) => {
      const current = runs.get(run.id)
      if (!current || current.finishedAt) return
      runs.set(run.id, {
        ...run,
        stopRequested: run.stopRequested || current.stopRequested,
        stoppedSessions: current.stoppedSessions,
      })
    },
    requestStop: async (runId) => {
      const current = runs.get(runId)
      if (current) runs.set(runId, { ...current, stopRequested: true })
    },
    requestSessionStop: async (runId, sessionId) => {
      const current = runs.get(runId)
      if (!current || !canStopFacts(current, sessionId)) return false
      if (!current.stoppedSessions.includes(sessionId))
        runs.set(runId, { ...current, stoppedSessions: [...current.stoppedSessions, sessionId] })
      return true
    },
    readingsOf: async (studyId) => [...readings.values()].filter((r) => r.studyId === studyId),
    verbatimsOf: async (sessionId) =>
      [...verbatims.values()].filter((v) => v.sessionId === sessionId),
    verbatimsOfStudy: async (studyId) =>
      [...verbatims.values()].filter((v) => v.studyId === studyId),
    factsOf: async (sessionId) => [...facts.values()].filter((f) => f.sessionId === sessionId),
    factsOfStudy: async (studyId) => [...facts.values()].filter((f) => f.studyId === studyId),
    getFact: async (id) => facts.get(id) ?? null,
    factsByIds: async (ids) => ids.flatMap((id) => facts.get(id) ?? []),
    verbatimsByIds: async (ids) => ids.flatMap((id) => verbatims.get(id) ?? []),
    replaceReading: async (input) => {
      const mine = [...facts.values()].filter((f) => f.sessionId === input.sessionId)
      for (const f of mine) if (f.status === 'proposed') facts.delete(f.id)
      const used = new Set(
        [...facts.values()]
          .filter((f) => f.sessionId === input.sessionId)
          .flatMap((f) => f.verbatimIds),
      )
      for (const v of [...verbatims.values()])
        if (
          v.sessionId === input.sessionId &&
          v.origin === 'ai' &&
          !v.setAside &&
          !used.has(v.id) &&
          !input.keep.includes(v.id)
        )
          verbatims.delete(v.id)
      for (const v of input.verbatims) verbatims.set(v.id, v)
      for (const f of input.facts) facts.set(f.id, f)
      readings.set(input.sessionId, input.reading)
    },
    saveFact: async (fact, expected) => {
      const current = facts.get(fact.id)
      if (expected === null ? current : current?.version !== expected) return 'stale'
      facts.set(fact.id, fact)
      return 'ok'
    },
    addVerbatim: async (v, attachTo) => {
      if (attachTo) {
        if (facts.get(attachTo.fact.id)?.version !== attachTo.expected) return 'stale'
        facts.set(attachTo.fact.id, attachTo.fact)
      }
      verbatims.set(v.id, v)
      return 'ok'
    },
    resizeVerbatim: async (id, place) => {
      const v = verbatims.get(id)
      if (v) verbatims.set(id, { ...v, ...place, origin: 'person' })
    },
    setAside: async (id) => setAsideOne(id),
    moveVerbatims: async (moves) => {
      for (const m of moves) {
        const v = verbatims.get(m.id)
        if (v) verbatims.set(m.id, { ...v, ...m })
      }
    },
    attributeSpeaker: async ({ sessionId, speaker, participant, setAside }) => {
      if (setAside)
        for (const v of [...verbatims.values()])
          if (v.sessionId === sessionId && v.speaker === speaker && !v.setAside) setAsideOne(v.id)
      const map = speakers.get(sessionId) ?? new Map<string, string>()
      map.set(speaker, participant)
      speakers.set(sessionId, map)
      for (const v of verbatims.values())
        if (v.sessionId === sessionId && v.speaker === speaker)
          verbatims.set(v.id, {
            ...v,
            participant: participant === 'interviewer' ? null : participant,
          })
    },
    speakersOf: async (sessionId) => speakers.get(sessionId) ?? new Map(),
    hasConsent: async (a, s, p) => consents.has(`${a}|${s}|${p}`),
    giveConsent: async (a, s, p) => {
      consents.add(`${a}|${s}|${p}`)
    },
    accountNames: async (ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
  }
  return { store, runs, readings, verbatims, facts, speakers }
}

export type FakeInterview = {
  readonly id: string
  readonly title: string
  readonly people: readonly Person[]
  /** null: no transcript. */
  readonly turns: readonly AnalysedText['turns'][number][] | null
  readonly clean?: boolean
  readonly importedAt?: Date
}

/** The other modules, as Evidence sees them. */
export const fakeSources = (input: {
  interviews: FakeInterview[]
  anonymised?: boolean
  textAnalysed?: TextAnalysed
  names?: string[]
  themes?: { id: string; title: string }[]
  access?: (accountId: string) => boolean
}) => {
  const state = {
    anonymised: input.anonymised ?? false,
    textAnalysed: input.textAnalysed ?? ('with-corrections' as TextAnalysed),
    enrichmentLive: false,
    imports: [] as string[],
    assigned: 0,
  }
  const allowed = input.access ?? (() => true)
  const sources: AnalysisSources = {
    studyAccess: async (accountId) =>
      allowed(accountId)
        ? {
            role: 'member',
            type: 'interviews',
            teamId: 'team',
            anonymised: state.anonymised,
            textAnalysed: state.textAnalysed,
          }
        : null,
    sessions: async (accountId) =>
      allowed(accountId)
        ? input.interviews.map((i) => ({ id: i.id, title: i.title, interviewDate: null }))
        : null,
    people: async (accountId, _studyId, options) => {
      if (!allowed(accountId)) return null
      if (options.assign) state.assigned++
      return Object.fromEntries(input.interviews.map((i) => [i.id, i.people]))
    },
    knownNames: async () => [
      ...(input.names ?? []),
      ...input.interviews.flatMap((i) => i.people.map((p) => p.name)),
    ],
    analysedText: async (_a, _s, sessionId, mode) => {
      const i = input.interviews.find((x) => x.id === sessionId)
      if (!i?.turns) return 'no-transcript'
      if (mode === 'clean-only' && !i.clean) return 'not-clean'
      return {
        turns: i.turns,
        rawImportedAt: i.importedAt ?? new Date('2026-10-01T00:00:00Z'),
        fingerprint: String(i.turns.map((t) => t.text).join('|').length),
      }
    },
    importTranscripts: async (_a, _s, ids) => {
      state.imports.push(...ids)
      return new Map()
    },
    context: async () => ({ goal: 'How teams find their data', themes: input.themes ?? [] }),
    enrichmentLive: async () => state.enrichmentLive,
  }
  return { sources, state }
}

/**
 * The AI, as the fake runner of the gateway answers (quickstart): per chunk, the first sentence of
 * each interviewee turn and one quote not in the text; per interview, one fact over all verbatims.
 */
export const fakeFactsAi = (options: { names?: string[] } = {}) => {
  const requests: { kind: string; ref: string; body: string }[] = []
  const state: {
    unavailable: boolean
    failChunks: number
    /** The fact pass's answer, when a test writes it (ids `v1`…). */
    facts: FactAnswer[] | null
  } = { unavailable: false, failChunks: 0, facts: null }
  const ai: FactsAi = {
    verbatims: async (_accountId, ref, request: VerbatimRequest) => {
      requests.push({ kind: 'verbatims', ref, body: JSON.stringify(request) })
      if (state.unavailable) throw new AiUnavailable()
      if (state.failChunks > 0) {
        state.failChunks--
        throw new Error('provider failed')
      }
      const out = request.turns
        .filter((t) => !t.context && t.role !== 'interviewer')
        .map((t) => ({ turn: t.id, text: t.text.split(/(?<=[.!?])\s/)[0] ?? t.text, reason: 'r' }))
      return [...out, { turn: request.turns[0]?.id ?? 't1', text: 'never said this', reason: null }]
    },
    facts: async (_accountId, ref, request): Promise<FactAnswer[]> => {
      requests.push({ kind: 'facts', ref, body: JSON.stringify(request) })
      if (state.unavailable) throw new AiUnavailable()
      if (state.facts) return state.facts
      return [
        {
          statement: {
            en: 'Finding the data takes time',
            fr: 'Trouver les données prend du temps',
          },
          polarity: 'negative',
          theme: request.themes[0]?.id ?? 'other',
          verbatims: request.verbatims.map((v) => v.id),
        },
        {
          statement: { en: `${options.names?.[0] ?? 'Sam'} said so`, fr: 'Dit' },
          polarity: 'neutral',
          theme: 'other',
          verbatims: ['v1'],
        },
      ]
    },
    translate: async (_accountId, ref, request) => {
      requests.push({ kind: 'translate', ref, body: JSON.stringify(request) })
      if (state.unavailable) throw new AiUnavailable()
      return `[${request.to}] ${request.text}`
    },
    providerOf: async () => 'anthropic',
    estimate: async (_a, chars) => chars / 1_000_000,
    costs: async (refs) => new Map(refs.map((r) => [r, 0.01])),
  }
  return { ai, requests, state }
}

export const makeDeps = (input: {
  sources: AnalysisSources
  ai: FactsAi
  clock: Clock
  store?: EvidenceStore
}) => {
  const memory = inMemoryEvidenceStore()
  const queued: FactsJob[] = []
  const translations: TranslateJob[] = []
  /** `accept: false`: the queue refuses the run (a job of the study still active). */
  const queue = { accept: true }
  const deps: EvidenceDeps = {
    store: input.store ?? memory.store,
    sources: input.sources,
    ai: input.ai,
    clock: input.clock,
    enqueueRun: async (job) => {
      if (!queue.accept) return false
      queued.push(job)
      return true
    },
    enqueueTranslation: async (job) => {
      translations.push(job)
      return true
    },
    log: { warn: () => undefined },
  }
  return { deps, memory, queued, translations, queue }
}
