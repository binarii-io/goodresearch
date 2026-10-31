import type { Clock, Person } from '@goodresearch/shared'
import type {
  AnalysedText,
  Evaluation,
  QualityAi,
  QualityDeps,
  QualitySources,
  QualityStore,
  ReviewJob,
  ReviewRequest,
  SpeakerCount,
  StoredReformulation,
  StoredRemark,
} from '../../application/ports.ts'
import { AiFailed, AiUnavailable } from '../../application/ports.ts'
import type { SentAnswer } from '../../domain/remarks.ts'
import type { ReviewRun } from '../../domain/review-run.ts'

/** The quality tables, in memory. */
export const inMemoryQualityStore = () => {
  const runs = new Map<string, ReviewRun>()
  const evaluations = new Map<string, Evaluation>()
  let counts: SpeakerCount[] = []
  let reformulations: StoredReformulation[] = []
  let remarks: StoredRemark[] = []
  const consents = new Set<string>()
  const store: QualityStore = {
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
      runs.set(run.id, { ...run, stopRequested: run.stopRequested || current.stopRequested })
    },
    requestStop: async (runId) => {
      const current = runs.get(runId)
      if (current) runs.set(runId, { ...current, stopRequested: true })
    },
    evaluationsOf: async (studyId) =>
      [...evaluations.values()].filter((e) => e.studyId === studyId),
    speakerCountsOf: async (studyId) => counts.filter((c) => c.studyId === studyId),
    reformulationsOf: async (studyId) => reformulations.filter((r) => r.studyId === studyId),
    remarksOf: async (studyId) => remarks.filter((r) => r.studyId === studyId),
    getRemark: async (id) => remarks.find((r) => r.id === id) ?? null,
    getReformulation: async (id) => reformulations.find((r) => r.id === id) ?? null,
    saveStance: async (remark, expectedVersion) => {
      if (remarks.find((r) => r.id === remark.id)?.version !== expectedVersion) return false
      remarks = remarks.map((r) => (r.id === remark.id ? remark : r))
      return true
    },
    requalify: async (remark, reformulationId) => {
      const found = reformulations.find((r) => r.id === reformulationId)
      if (!found || found.requalifiedRemarkId) return false
      reformulations = reformulations.map((r) =>
        r.id === reformulationId ? { ...r, requalifiedRemarkId: remark.id } : r,
      )
      remarks = [...remarks, remark]
      return true
    },
    withdrawRemark: async (remarkId, expectedVersion) => {
      if (remarks.find((r) => r.id === remarkId)?.version !== expectedVersion) return false
      remarks = remarks.filter((r) => r.id !== remarkId)
      reformulations = reformulations.map((r) =>
        r.requalifiedRemarkId === remarkId ? { ...r, requalifiedRemarkId: null } : r,
      )
      return true
    },
    replaceReview: async (input) => {
      const { sessionId } = input.evaluation
      counts = [...counts.filter((c) => c.sessionId !== sessionId), ...input.counts]
      reformulations = [
        ...reformulations.filter(
          (r) => r.sessionId !== sessionId || r.requalifiedRemarkId !== null,
        ),
        ...input.reformulations,
      ]
      remarks = [
        ...remarks.filter(
          (r) => r.sessionId !== sessionId || r.origin !== 'ai' || r.stance !== null,
        ),
        ...input.remarks,
      ]
      evaluations.set(sessionId, input.evaluation)
    },
    hasConsent: async (accountId, studyId, provider) =>
      consents.has(`${accountId}|${studyId}|${provider}`),
    giveConsent: async (accountId, studyId, provider) => {
      consents.add(`${accountId}|${studyId}|${provider}`)
    },
  }
  return {
    store,
    runs,
    evaluations,
    counts: () => counts,
    reformulations: () => reformulations,
    remarks: () => remarks,
    setStance: (id: string, stance: 'agree' | 'disagree' | null) => {
      remarks = remarks.map((r) => (r.id === id ? { ...r, stance } : r))
    },
  }
}

export type FakeInterview = {
  readonly id: string
  readonly title: string
  readonly people: readonly Person[]
  /** null: no transcript. */
  readonly turns: readonly AnalysedText['turns'][number][] | null
  readonly attributions?: ReadonlyMap<string, string>
  /** It has a transcript file not imported yet, with `turns` null. */
  readonly file?: boolean
}

/** The other modules, as Interview Quality sees them. */
export const fakeSources = (input: {
  interviews: FakeInterview[]
  anonymised?: boolean
  names?: string[]
  goal?: string
  guide?: string[]
  type?: string
  access?: (accountId: string) => boolean
  folderAccess?: (accountId: string) => boolean
}) => {
  const state = {
    enrichmentLive: false,
    factsLive: false,
    anonymised: input.anonymised ?? false,
    imports: [] as string[],
    importFailures: new Map<string, string>(),
  }
  const allowed = input.access ?? (() => true)
  const inFolder = input.folderAccess ?? (() => true)
  const importedAt = new Date('2026-10-01T00:00:00Z')
  const sources: QualitySources = {
    studyAccess: async (accountId) =>
      allowed(accountId)
        ? {
            type: input.type ?? 'interviews',
            anonymised: state.anonymised,
            textAnalysed: 'with-corrections',
          }
        : null,
    sessions: async (accountId) =>
      inFolder(accountId)
        ? input.interviews.map((i) => ({
            id: i.id,
            title: i.title,
            interviewDate: '2026-10-01',
            transcript: i.turns || i.file ? { fileId: `file-${i.id}` } : null,
          }))
        : null,
    people: async () => Object.fromEntries(input.interviews.map((i) => [i.id, i.people])),
    knownNames: async () => input.names ?? [],
    analysedText: async (_a, _s, sessionId) => {
      const found = input.interviews.find((i) => i.id === sessionId)
      if (!found?.turns) return 'no-transcript'
      return { turns: found.turns, rawImportedAt: importedAt, fingerprint: 'f' }
    },
    importTranscripts: async (_a, _s, ids) => {
      state.imports.push(...ids)
      return state.importFailures
    },
    context: async () => ({ goal: input.goal ?? 'Understand exports', guide: input.guide ?? [] }),
    speakerAttributions: async (sessionId) =>
      input.interviews.find((i) => i.id === sessionId)?.attributions ?? new Map(),
    enrichmentLive: async () => state.enrichmentLive,
    factsLive: async () => state.factsLive,
  }
  return { sources, state }
}

/** The AI: answers from a function, records what it was sent and the ledger refs of its calls. */
export const fakeQualityAi = (
  answer: (request: ReviewRequest) => readonly SentAnswer[] = () => [],
) => {
  const requests: ReviewRequest[] = []
  const refs: string[] = []
  const state = {
    provider: 'anthropic' as string | null,
    failFor: null as ((request: ReviewRequest) => boolean) | null,
    failures: 0,
    unavailable: false,
    costPerCall: 0.01,
  }
  const ai: QualityAi = {
    review: async (_accountId, ref, request) => {
      if (state.unavailable) throw new AiUnavailable()
      refs.push(ref)
      if (state.failFor?.(request)) {
        state.failures++
        throw new AiFailed(false)
      }
      requests.push(request)
      return answer(request)
    },
    providerOf: async () => state.provider,
    estimate: async () => 0.5,
    costs: async (wanted) =>
      new Map(
        wanted.map((ref) => [ref, refs.filter((r) => r === ref).length * state.costPerCall || 0]),
      ),
  }
  return { ai, requests, refs, state }
}

export const makeDeps = (input: { sources: QualitySources; ai: QualityAi; clock: Clock }) => {
  const memory = inMemoryQualityStore()
  const jobs: ReviewJob[] = []
  const queue = { refuse: false }
  const deps: QualityDeps = {
    store: memory.store,
    sources: input.sources,
    ai: input.ai,
    clock: input.clock,
    enqueueRun: async (job) => {
      if (queue.refuse) return false
      jobs.push(job)
      return true
    },
    log: { warn: () => {} },
  }
  return { deps, memory, jobs, queue }
}
