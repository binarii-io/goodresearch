import { fold, ok } from '@goodresearch/shared'
import {
  AiFailed,
  AiUnavailable,
  type CleanFiles,
  type CleaningAi,
  type CleaningNames,
  type CleaningPerson,
  type CleaningRequest,
  type CleaningRow,
  type CleaningStore,
  type CleanPublication,
  type CleanVersion,
} from '../../application/ports.ts'
import type { DocModel } from '../../domain/clean-doc.ts'
import type { AnswerCorrection, AnswerDecision } from '../../domain/correction-check.ts'
import type { CorrectionRun } from '../../domain/correction-run.ts'
import type { Correction, NameDecision, Suggestion } from '../../domain/corrections.ts'

/** The cleaning store in memory (use-case tests). */
export const createInMemoryCleaning = () => {
  const corrections = new Map<string, Correction & { studyId: string }>()
  const suggestions = new Map<string, Suggestion>()
  const decisions = new Map<string, Map<string, NameDecision>>()
  const cleanings = new Map<string, CleaningRow>()
  const versions: CleanVersion[] = []
  const publications = new Map<string, CleanPublication & { studyId?: string }>()
  const folders = new Map<string, { folderId: string; name: string }>()
  const runs = new Map<string, CorrectionRun>()
  const same = (c: Correction) =>
    `${c.sessionId}|${c.segmentId}|${c.target}|${c.offset}|${c.original}|${c.replacement}`

  const store: CleaningStore = {
    storedCorrections: async (sessionId) =>
      [...corrections.values()]
        .filter((c) => c.sessionId === sessionId)
        .map(({ studyId: _, ...c }) => c),
    insertCorrection: async (c, studyId) => {
      if ([...corrections.values()].some((x) => same(x) === same(c))) return 'exists'
      corrections.set(c.key, { ...c, studyId })
      return 'ok'
    },
    saveCorrection: async (c, expected) => {
      const current = corrections.get(c.key)
      if (!current || current.version !== expected) return 'stale'
      corrections.set(c.key, { ...current, ...c, studyId: current.studyId })
      return 'ok'
    },
    replaceFindings: async (input) => {
      const read = new Set(input.readSegments)
      for (const [k, c] of corrections)
        if (
          c.sessionId === input.sessionId &&
          c.source === 'ai-other' &&
          c.status === 'proposed' &&
          read.has(c.segmentId)
        )
          corrections.delete(k)
      for (const [k, s] of suggestions)
        if (s.sessionId === input.sessionId && read.has(s.segmentId)) suggestions.delete(k)
      for (const c of input.corrections)
        if (![...corrections.values()].some((x) => same(x) === same(c)))
          corrections.set(c.key, { ...c, studyId: input.studyId })
      for (const s of input.suggestions)
        suggestions.set(`${s.termId}|${s.segmentId}|${s.offset}`, s)
      const before = cleanings.get(input.sessionId)
      cleanings.set(input.sessionId, {
        sessionId: input.sessionId,
        studyId: input.studyId,
        aiReadSegments: [...new Set([...(before?.aiReadSegments ?? []), ...read])],
        anonymised: input.anonymised,
        lastRunId: input.runId,
        cleanedAt: input.at,
      })
    },
    markCleaned: async (input) => {
      const before = cleanings.get(input.sessionId)
      cleanings.set(input.sessionId, {
        sessionId: input.sessionId,
        studyId: input.studyId,
        aiReadSegments: before?.aiReadSegments ?? [],
        anonymised: input.anonymised,
        lastRunId: input.runId,
        cleanedAt: input.at,
      })
    },
    suggestionsOf: async (sessionId) =>
      [...suggestions.values()].filter((s) => s.sessionId === sessionId),
    decisionsOf: async (sessionId) => new Map(decisions.get(sessionId) ?? []),
    saveDecision: async (sessionId, key, decision) => {
      const mine = decisions.get(sessionId) ?? new Map()
      if (decision) mine.set(key, decision)
      else mine.delete(key)
      decisions.set(sessionId, mine)
    },
    cleaningsOf: async (studyId) => [...cleanings.values()].filter((c) => c.studyId === studyId),
    versionsOf: async (sessionId) =>
      versions
        .filter((v) => v.sessionId === sessionId)
        .sort((a, b) => b.number - a.number)
        .map(({ segments: _, ...v }) => v),
    latestVersion: async (sessionId) =>
      versions.filter((v) => v.sessionId === sessionId).sort((a, b) => b.number - a.number)[0] ??
      null,
    latestVersions: async () => {
      const out = new Map<string, Omit<CleanVersion, 'segments'>>()
      for (const { segments: _, ...v } of versions)
        if ((out.get(v.sessionId)?.number ?? 0) < v.number) out.set(v.sessionId, v)
      return out
    },
    addVersion: async (v) => {
      const number =
        Math.max(0, ...versions.filter((x) => x.sessionId === v.sessionId).map((x) => x.number)) + 1
      versions.push({ ...v, number })
      return number
    },
    publicationOf: async (sessionId) => publications.get(sessionId) ?? null,
    publicationsOf: async () => new Map(publications),
    savePublication: async (p) => {
      publications.set(p.sessionId, p)
    },
    folderOf: async (studyId) => folders.get(studyId) ?? null,
    saveFolder: async (studyId, folderId, name) => {
      folders.set(studyId, { folderId, name })
    },
    createCleaningRun: async (run) => {
      if ([...runs.values()].some((r) => r.studyId === run.studyId && r.finishedAt === null))
        return false
      runs.set(run.id, run)
      return true
    },
    getCleaningRun: async (id) => runs.get(id) ?? null,
    openCleaningRun: async (studyId) =>
      [...runs.values()].find((r) => r.studyId === studyId && r.finishedAt === null) ?? null,
    saveCleaningRun: async (run) => {
      const current = runs.get(run.id)
      if (!current || current.finishedAt !== null) return
      runs.set(run.id, { ...run, stopRequested: current.stopRequested })
    },
    cleaningHeartbeat: async (id, at) => {
      const r = runs.get(id)
      if (r) runs.set(id, { ...r, heartbeatAt: at })
    },
    cleaningStopRequested: async (id) => {
      const r = runs.get(id)
      return !r || r.stopRequested || r.finishedAt !== null
    },
    requestCleaningStop: async (id) => {
      const r = runs.get(id)
      if (r) runs.set(id, { ...r, stopRequested: true })
    },
    cleaningRunsOf: async (studyId) =>
      [...runs.values()]
        .filter((r) => r.studyId === studyId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
  }
  return { store, corrections, suggestions, cleanings, versions, publications, folders, runs }
}

/**
 * The AI in tests: for each new turn, corrects "eating" into "meeting" when written there, says
 * yes to every place sent, and adds one correction not in the turn and one of 12 words (dropped).
 */
export const fakeCleaningAi = (options: { fail?: 'unavailable' | 'failed' | 'once' } = {}) => {
  const requests: CleaningRequest[] = []
  const refs: string[] = []
  let failures = 0
  const ai: CleaningAi = {
    correct: async (_accountId, ref, request) => {
      requests.push(request)
      refs.push(ref)
      if (options.fail === 'unavailable') throw new AiUnavailable()
      if (options.fail === 'failed' || (options.fail === 'once' && failures++ === 0))
        throw new AiFailed(false)
      const corrections: AnswerCorrection[] = []
      for (const t of request.chunk.turns) {
        if (t.context) continue
        if (/\beating\b/.test(t.sent) && !fold(t.sent).includes('eating out'))
          corrections.push({
            turn: t.id,
            kind: 'transcription',
            original: 'eating',
            before: null,
            replacement: 'meeting',
            reason: 'a meeting is talked about',
            confidence: 'high',
          })
      }
      const first = request.chunk.turns.find((t) => !t.context)
      if (first) {
        corrections.push({
          turn: first.id,
          kind: 'transcription',
          original: 'not in this turn',
          before: null,
          replacement: 'x',
          reason: null,
          confidence: 'low',
        })
        corrections.push({
          turn: first.id,
          kind: 'transcription',
          original: first.sent.split(' ')[0] ?? '',
          before: null,
          replacement: 'one two three four five six seven eight nine ten eleven twelve',
          reason: null,
          confidence: 'low',
        })
      }
      const decisions: AnswerDecision[] = request.chunk.occurrences.map((o) => ({
        occurrence: o.id,
        isTerm: true,
        reason: 'fits the context',
      }))
      return { corrections, decisions }
    },
  }
  return { ai, requests, refs }
}

/** The same people in every interview of the study; `assigns` tells which calls gave codes. */
export const fakeCleaningNames = (people: CleaningPerson[], anonymised = true) => {
  const assigns: boolean[] = []
  const names: CleaningNames = async (_a, _s, options) => {
    assigns.push(options.assign)
    return {
      anonymised,
      people: new Proxy({} as Record<string, readonly CleaningPerson[]>, { get: () => people }),
    }
  }
  return { names, assigns }
}

/** A study folder in memory: documents with a revision that moves on each write. */
export const fakeCleanFiles = () => {
  const files = new Map<
    string,
    {
      name: string
      parent: string
      doc: DocModel
      revision: number
      trashed: boolean
      folder: boolean
    }
  >()
  const writes: string[] = []
  let next = 0
  files.set('study-folder', {
    name: 'Study',
    parent: '',
    doc: { blocks: [] },
    revision: 1,
    trashed: false,
    folder: true,
  })
  files.set('original', {
    name: 'Interview',
    parent: 'study-folder',
    doc: { blocks: [] },
    revision: 1,
    trashed: false,
    folder: false,
  })
  const files_: CleanFiles = {
    ensureFolder: async (name, knownId) => {
      const known = knownId ? files.get(knownId) : undefined
      if (knownId && known?.folder && !known.trashed && known.parent === 'study-folder')
        return ok({ id: knownId })
      const id = `folder-${++next}`
      files.set(id, {
        name,
        parent: 'study-folder',
        doc: { blocks: [] },
        revision: 1,
        trashed: false,
        folder: true,
      })
      return ok({ id })
    },
    createDocument: async (folderId, name, doc) => {
      const id = `doc-${++next}`
      files.set(id, { name, parent: folderId, doc, revision: 1, trashed: false, folder: false })
      writes.push(id)
      return ok({ id, webViewLink: `https://drive.test/${id}` })
    },
    revision: async (fileId) => {
      const f = files.get(fileId)
      return ok(f && !f.trashed ? String(f.revision) : null)
    },
    rewriteDocument: async (fileId, doc, revision) => {
      const f = files.get(fileId)
      if (!f || String(f.revision) !== revision)
        return { ok: false, error: 'DRIVE_CHANGED_MEANWHILE' as const }
      files.set(fileId, { ...f, doc, revision: f.revision + 1 })
      writes.push(fileId)
      return ok(undefined)
    },
    metadata: async (fileId) => {
      const f = files.get(fileId)
      return ok(
        f
          ? { trashed: f.trashed, parents: [f.parent], webViewLink: `https://drive.test/${fileId}` }
          : null,
      )
    },
  }
  return { port: async () => ok(files_), files, writes }
}
