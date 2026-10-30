import { err, fixedClock, fold, ok } from '@goodresearch/shared'
import {
  AiFailed,
  AiUnavailable,
  type LexiconAi,
  type ReadFailure,
  type SourceSession,
  type Sources,
  type TranscriptsDeps,
  type TranscriptsStore,
} from '../../application/ports.ts'
import type { AnswerTerm } from '../../domain/answer-check.ts'
import { type CommonWords, isClose } from '../../domain/candidates.ts'
import type { Batch } from '../../domain/excerpts.ts'
import { canStopReading, type LexiconRun, type Transcript } from '../../domain/lexicon-run.ts'
import type { LexiconTerm } from '../../domain/lexicon-term.ts'
import type { Occurrence, Verdict } from '../../domain/occurrences.ts'

/** The transcripts store in memory (use-case tests). */
export const createInMemoryStore = () => {
  const transcripts = new Map<string, Transcript>()
  const terms = new Map<string, LexiconTerm>()
  const occurrences = new Map<string, Occurrence[]>()
  const runs = new Map<string, LexiconRun>()
  const consents = new Set<string>()
  const verdicts = new Map<string, Verdict & { studyId: string }>()
  const placeKey = (p: { termId: string; segmentId: string; offset: number }) =>
    `${p.termId}/${p.segmentId}/${p.offset}`
  const taken = (t: LexiconTerm) =>
    t.status !== 'merged' &&
    [...terms.values()].some(
      (o) =>
        o.id !== t.id &&
        o.teamId === t.teamId &&
        o.language === t.language &&
        o.status !== 'merged' &&
        fold(o.form) === fold(t.form),
    )
  const store: TranscriptsStore = {
    transcriptsOf: async (studyId) =>
      [...transcripts.values()].filter((t) => t.studyId === studyId),
    getTranscript: async (id) => transcripts.get(id) ?? null,
    saveTranscript: async (t) => {
      transcripts.set(t.sessionId, t)
    },
    markRead: async (ids, at) => {
      for (const id of ids) {
        const t = transcripts.get(id)
        if (t) transcripts.set(id, { ...t, readAt: at })
      }
    },
    teamTerms: async (teamId) => [...terms.values()].filter((t) => t.teamId === teamId),
    getTerm: async (id) => terms.get(id) ?? null,
    insertTerm: async (t) => {
      if (taken(t)) return 'exists'
      terms.set(t.id, t)
      return 'ok'
    },
    saveTerm: async (t, expected) => {
      if (terms.get(t.id)?.version !== expected) return 'stale'
      if (taken(t)) return 'exists'
      terms.set(t.id, t)
      return 'ok'
    },
    saveMerge: async (from, fromExpected, into, intoExpected) => {
      if (
        terms.get(from.id)?.version !== fromExpected ||
        terms.get(into.id)?.version !== intoExpected
      )
        return 'stale'
      terms.set(from.id, from)
      terms.set(into.id, into)
      for (const [study, rows] of occurrences)
        occurrences.set(
          study,
          rows.map((o) => (o.termId === from.id ? { ...o, termId: into.id } : o)),
        )
      for (const [key, v] of [...verdicts]) {
        if (v.termId !== from.id) continue
        verdicts.delete(key)
        const moved = { ...v, termId: into.id }
        if (!verdicts.has(placeKey(moved))) verdicts.set(placeKey(moved), moved)
      }
      return 'ok'
    },
    replaceOccurrences: async (studyId, rows) => {
      occurrences.set(studyId, [...rows])
    },
    createRun: async (run) => {
      if ([...runs.values()].some((r) => r.studyId === run.studyId && r.finishedAt === null))
        return false
      runs.set(run.id, run)
      return true
    },
    getRun: async (id) => runs.get(id) ?? null,
    openRun: async (studyId) =>
      [...runs.values()].find((r) => r.studyId === studyId && r.finishedAt === null) ?? null,
    saveRun: async (run) => {
      const current = runs.get(run.id)
      if (current?.finishedAt) return
      runs.set(run.id, {
        ...run,
        stopRequested: (current?.stopRequested ?? false) || run.stopRequested,
        stoppedSessions: current?.stoppedSessions ?? run.stoppedSessions,
      })
    },
    batchProcessed: async (id, batchesDone, at) => {
      const r = runs.get(id)
      if (r && !r.finishedAt) runs.set(id, { ...r, batchesDone, heartbeatAt: at })
    },
    stopRequested: async (id) => {
      const r = runs.get(id)
      return !r || r.stopRequested || r.finishedAt !== null
    },
    requestStop: async (id) => {
      const r = runs.get(id)
      if (r) runs.set(id, { ...r, stopRequested: true })
    },
    requestSessionStop: async (id, sessionId) => {
      const r = runs.get(id)
      if (!r || !canStopReading(r, sessionId)) return false
      if (!r.stoppedSessions.includes(sessionId))
        runs.set(id, { ...r, stoppedSessions: [...r.stoppedSessions, sessionId] })
      return true
    },
    verdictsOf: async (studyId) => [...verdicts.values()].filter((v) => v.studyId === studyId),
    saveVerdict: async (place, verdict) => {
      if (verdict) verdicts.set(placeKey(place), { ...place, ...verdict })
      else verdicts.delete(placeKey(place))
    },
    occurrencesOf: async (studyId) => occurrences.get(studyId) ?? [],
    otherStudies: async (termIds, studyId) =>
      new Map(
        termIds.map((id) => [
          id,
          [...occurrences].filter(([s, rows]) => s !== studyId && rows.some((r) => r.termId === id))
            .length,
        ]),
      ),
    runsOf: async (studyId) =>
      [...runs.values()]
        .filter((r) => r.studyId === studyId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || b.id.localeCompare(a.id)),
    accountNames: async (ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
    hasConsent: async (a, s, p, purpose = 'lexicon') => consents.has(`${a}/${s}/${p}/${purpose}`),
    giveConsent: async (a, s, p, _at, purpose = 'lexicon') => {
      consents.add(`${a}/${s}/${p}/${purpose}`)
    },
  }
  return { store, transcripts, terms, occurrences, runs, verdicts }
}

/** Validated interviews with their text, as ingestion would give them. */
export const fakeSources = (input: {
  sessions: (SourceSession & { text?: string; failure?: ReadFailure })[]
  names?: string[]
  toValidate?: number
  /** Null: the person has no access. */
  access?: boolean
}) => {
  const reads: string[] = []
  const sources: Sources = {
    enrichmentSessions: async () =>
      input.access === false
        ? null
        : { sessions: input.sessions, toValidate: input.toValidate ?? 0 },
    readTranscript: async (_a, _s, id) => {
      reads.push(id)
      const s = input.sessions.find((x) => x.id === id)
      if (!s) return err('FILE_NOT_FOUND')
      if (s.failure) return err(s.failure)
      return ok({ text: s.text ?? '', modifiedAt: s.transcript?.modifiedAt ?? null })
    },
    knownNames: async () => input.names ?? [],
  }
  return { sources, reads, sessions: input.sessions }
}

/**
 * The AI in tests: groups each candidate with the close accepted form or with the close candidates
 * before it, quotes its first excerpt, and records every batch sent.
 */
export const fakeAi = (
  options: { provider?: string | null; fail?: 'unavailable' | 'failed' } = {},
) => {
  const batches: Batch[] = []
  const refs: string[] = []
  const ai: LexiconAi = {
    propose: async (_accountId, ref, batch) => {
      batches.push(batch)
      refs.push(ref)
      if (options.fail === 'unavailable') throw new AiUnavailable()
      if (options.fail === 'failed') throw new AiFailed(false)
      const out: AnswerTerm[] = []
      for (const c of batch.candidates) {
        const known = batch.knownForms.find((f) => isClose(fold(f), fold(c.spelling)))
        const group = out.find((t) => isClose(fold(t.form), fold(c.spelling)))
        if (group) {
          ;(group.variants as string[]).push(c.spelling)
          continue
        }
        out.push({
          form: known ?? c.spelling,
          kind: 'domain',
          correction: null,
          category: /^[A-Z]{2,6}$/.test(c.spelling) ? 'acronym' : 'product',
          definition: null,
          variants: [c.spelling],
          existingTerm: known ?? null,
          quote: c.excerpts[0] ?? '',
        })
      }
      return out
    },
    providerOf: async () => (options.provider === undefined ? 'fake' : options.provider),
    estimate: async (_a, chars, tokens, calls) => (chars + tokens + calls) / 1_000_000,
    costs: async (rs) => new Map(rs.map((r) => [r, refs.includes(r) ? 0.01 : null])),
  }
  return { ai, batches, refs }
}

export const COMMON = new Set(
  'we use the and it is a to for our team every day on good research tool i love with this that of in went up again hello welcome said told yes no really'.split(
    ' ',
  ),
)
export const common: CommonWords = (_language, word) => COMMON.has(word)

export const NOW = new Date('2026-10-26T10:00:00Z')

export const testDeps = (over: Partial<TranscriptsDeps> & Pick<TranscriptsDeps, 'sources'>) => {
  const memory = createInMemoryStore()
  const clock = fixedClock(NOW)
  const jobs: { runId: string; studyId: string }[] = []
  const deps: TranscriptsDeps = {
    store: memory.store,
    studies: {
      getStudyAccess: async (_a, studyId) =>
        studyId === 'missing'
          ? null
          : {
              role: 'member',
              type: 'interviews',
              teamId: studyId === 'other-team' ? 'team-2' : 'team-1',
              anonymised: false,
            },
    },
    ai: fakeAi().ai,
    common,
    enqueue: async (job) => {
      jobs.push(job)
      return true
    },
    clock,
    log: { warn: () => {} },
    ...over,
  }
  return { deps, memory, clock, jobs }
}
