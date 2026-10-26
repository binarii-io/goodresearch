import type { Clock } from '@goodresearch/shared'
import { fixedClock, newId } from '@goodresearch/shared'
import { CIPHER_PURPOSES, createTokenCipher } from '#platform/crypto/token-cipher.ts'
import { makeAnalysisCommands } from '../../application/commands/analysis-commands.ts'
import { makeRenameCommands } from '../../application/commands/rename-commands.ts'
import { makeRunInventory } from '../../application/commands/run-inventory.ts'
import { makeSessionCommands } from '../../application/commands/session-commands.ts'
import { makeSourceCommands } from '../../application/commands/source-commands.ts'
import {
  AiUnavailable,
  type AnalysisJob,
  type AnalysisRun,
  type Analyzer,
  type AnalyzerAnswer,
  type IngestionDeps,
  type IngestionStore,
  type InventoryFailure,
  type InventoryJob,
  type OauthState,
  type PlannedSummary,
  type SessionWrite,
  type SourceConnection,
  type StudySource,
} from '../../application/ports.ts'
import { makeSessionQueries } from '../../application/queries/session-queries.ts'
import { makeSourceQueries, makeStudyActionGate } from '../../application/queries/source-queries.ts'
import { makeStudyFiles } from '../../application/study-files.ts'
import type { Analysis } from '../../domain/analysis.ts'
import type { FolderAccessResult } from '../../domain/folder-access.ts'
import { type InventoryRun, isActiveRun } from '../../domain/inventory-run.ts'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { assignPseudonyms } from '../../domain/pseudonyms.ts'
import { reconcileSessions } from '../../domain/reconcile-sessions.ts'
import { givesUpRecordings, type Session, withoutRecordings } from '../../domain/session.ts'
import { InMemoryDrive } from './in-memory-drive.ts'

/** Same rules as the Drizzle store, including run-scoped writes. */
export class InMemoryIngestionStore implements IngestionStore {
  readonly connections = new Map<string, SourceConnection>()
  readonly states = new Map<string, OauthState>()
  readonly sources = new Map<string, StudySource>()
  readonly runs = new Map<string, string | null>()
  readonly files = new Map<string, InventoryFile[]>()
  readonly access = new Map<string, { result: FolderAccessResult; checkedAt: Date }>()
  readonly sessions = new Map<string, Session>()

  #dropSessions(studyId: string) {
    for (const [id, s] of this.sessions) if (s.studyId === studyId) this.sessions.delete(id)
  }

  #write(s: Session, expected: number): SessionWrite {
    const current = this.sessions.get(s.id)
    if (!current || current.version !== expected) return 'stale'
    const mine = new Set([...s.media.map((m) => m.fileId), ...s.attachments.map((a) => a.fileId)])
    if (
      [...this.sessions.values()].some(
        (o) =>
          o.id !== s.id &&
          o.studyId === s.studyId &&
          (o.media.some((m) => mine.has(m.fileId)) ||
            o.attachments.some((a) => mine.has(a.fileId))),
      )
    )
      return 'media-taken'
    if (
      s.plannedInterviewId &&
      [...this.sessions.values()].some(
        (o) =>
          o.id !== s.id && o.studyId === s.studyId && o.plannedInterviewId === s.plannedInterviewId,
      )
    )
      return 'linked'
    this.sessions.set(s.id, { ...s, version: expected + 1 })
    return 'saved'
  }

  #isCurrent(run: InventoryRun): boolean {
    const s = this.sources.get(run.studyId)
    return Boolean(
      s &&
        s.folderId === run.folderId &&
        this.runs.get(run.studyId) === run.runId &&
        s.inventory.status === 'running',
    )
  }

  async getConnection(id: string) {
    return this.connections.get(id) ?? null
  }
  async saveConnection(c: SourceConnection) {
    this.connections.set(c.accountId, c)
  }
  async markConnectionLost(id: string) {
    const c = this.connections.get(id)
    if (c) this.connections.set(id, { ...c, status: 'lost' })
  }
  async deleteConnection(id: string) {
    this.connections.delete(id)
  }
  async saveOauthState(s: OauthState, now: Date) {
    for (const [key, value] of this.states) if (value.expiresAt <= now) this.states.delete(key)
    this.states.set(s.state, s)
  }
  async takeOauthState(state: string, now: Date) {
    const s = this.states.get(state)
    this.states.delete(state)
    return s && s.expiresAt > now ? s : null
  }
  async getSource(id: string) {
    return this.sources.get(id) ?? null
  }
  async attachSource(s: StudySource) {
    this.sources.set(s.studyId, s)
    this.runs.set(s.studyId, null)
    this.files.delete(s.studyId)
    this.#dropSessions(s.studyId)
    for (const key of this.access.keys())
      if (key.startsWith(`${s.studyId}:`)) this.access.delete(key)
  }
  async deleteSource(id: string) {
    this.sources.delete(id)
    this.files.delete(id)
    this.#dropSessions(id)
  }
  async startInventory(id: string, runBy: string, now: Date) {
    const s = this.sources.get(id)
    if (!s || isActiveRun(s.inventory, now)) return null
    const runId = newId()
    this.runs.set(id, runId)
    this.sources.set(id, {
      ...s,
      inventory: {
        ...s.inventory,
        status: 'running',
        startedAt: now,
        runBy,
        progress: { folders: 0, files: 0 },
        failure: null,
      },
    })
    return { studyId: id, folderId: s.folderId, runId }
  }
  async updateProgress(run: InventoryRun, progress: { folders: number; files: number }) {
    const s = this.sources.get(run.studyId)
    if (s && this.#isCurrent(run))
      this.sources.set(run.studyId, { ...s, inventory: { ...s.inventory, progress } })
  }
  async completeInventory(
    run: InventoryRun,
    files: readonly InventoryFile[],
    folder: { name: string; ownerName: string | null },
    now: Date,
    options?: { sessions: boolean },
  ) {
    const s = this.sources.get(run.studyId)
    if (!s || !this.#isCurrent(run)) return false
    this.files.set(run.studyId, [...files])
    if (options?.sessions !== false) await this.#reconcile(run.studyId, files, now)
    this.sources.set(run.studyId, {
      ...s,
      folderName: folder.name,
      ownerName: folder.ownerName,
      inventory: {
        ...s.inventory,
        status: 'done',
        finishedAt: now,
        lastSuccessAt: now,
        failure: null,
        progress: null,
      },
    })
    return true
  }
  async failInventory(run: InventoryRun, failure: InventoryFailure, now: Date) {
    const s = this.sources.get(run.studyId)
    if (s && this.#isCurrent(run)) {
      this.sources.set(run.studyId, {
        ...s,
        inventory: { ...s.inventory, status: 'failed', finishedAt: now, failure, progress: null },
      })
    }
  }
  async getFolderAccess(studyId: string, accountId: string) {
    return this.access.get(`${studyId}:${accountId}`) ?? null
  }
  async saveFolderAccess(
    studyId: string,
    accountId: string,
    result: FolderAccessResult,
    now: Date,
  ) {
    this.access.set(`${studyId}:${accountId}`, { result, checkedAt: now })
  }
  async clearFolderAccessOf(accountId: string) {
    for (const key of this.access.keys()) if (key.endsWith(`:${accountId}`)) this.access.delete(key)
  }
  async listFiles(id: string, filter: { kind?: string | undefined; group?: string | undefined }) {
    return (this.files.get(id) ?? []).filter(
      (f) =>
        (!filter.kind || f.kind === filter.kind) && (!filter.group || f.group === filter.group),
    )
  }
  async totals(id: string) {
    const files = this.files.get(id) ?? []
    const byKind = { transcript: 0, media: 0, other: 0 }
    const groups = new Map<string, number>()
    for (const f of files) {
      byKind[f.kind]++
      groups.set(f.group, (groups.get(f.group) ?? 0) + 1)
    }
    return {
      byKind,
      byGroup: [...groups]
        .map(([group, count]) => ({ group, count }))
        .sort((a, b) => a.group.localeCompare(b.group)),
    }
  }
  async folderSummaries(accountId: string, ids: readonly string[]) {
    const result = new Map<string, { folderName: string | null }>()
    for (const id of ids) {
      const s = this.sources.get(id)
      if (s)
        result.set(id, {
          folderName:
            this.access.get(`${id}:${accountId}`)?.result === 'granted' ? s.folderName : null,
        })
    }
    return result
  }
  async accountNames(ids: readonly string[]) {
    return new Map(ids.map((id) => [id, id]))
  }
  async accountName(id: string) {
    return id
  }
  async #reconcile(studyId: string, files: readonly InventoryFile[], now: Date) {
    const r = reconcileSessions({
      studyId,
      files,
      sessions: await this.listSessions(studyId),
      now,
      newId,
    })
    for (const id of r.removed) this.sessions.delete(id)
    for (const m of r.media) {
      const s = this.sessions.get(m.id)
      if (s)
        this.sessions.set(m.id, { ...s, media: m.media, updatedAt: now, version: s.version + 1 })
    }
    for (const s of r.created) this.sessions.set(s.id, s)
  }
  async backfillSessions(studyId: string, now: Date) {
    await this.#reconcile(studyId, this.files.get(studyId) ?? [], now)
  }
  async listSessions(studyId: string) {
    return [...this.sessions.values()].filter((s) => s.studyId === studyId)
  }
  async getSession(id: string) {
    return this.sessions.get(id) ?? null
  }
  async saveSession(s: Session, expected: number, release: readonly string[] = []) {
    const before = new Map(this.sessions)
    const taken = new Set(s.media.map((m) => m.fileId))
    for (const id of release) {
      const o = this.sessions.get(id)
      if (!o || o.studyId !== s.studyId || !givesUpRecordings(o)) continue
      const rest = withoutRecordings(o, taken, s.updatedAt)
      if (rest) this.sessions.set(id, { ...rest, version: o.version + 1 })
      else this.sessions.delete(id)
    }
    const written = this.#write(s, expected)
    if (written !== 'saved') for (const [id, o] of before) this.sessions.set(id, o)
    return written
  }
  readonly pseudonyms = new Map<string, Map<string, string>>()
  readonly consents = new Set<string>()
  readonly analysisRuns = new Map<string, AnalysisRun>()

  async writeAnalysis(sessionId: string, expected: number, analysis: Analysis | null) {
    const current = this.sessions.get(sessionId)
    if (!current || current.version !== expected) return 'stale' as const
    this.sessions.set(sessionId, { ...current, analysis, version: expected + 1 })
    return 'saved' as const
  }
  async ensurePseudonyms(studyId: string, needed: readonly { key: string; date: string | null }[]) {
    const codes = this.pseudonyms.get(studyId) ?? new Map<string, string>()
    for (const f of assignPseudonyms(codes, needed)) codes.set(f.key, f.code)
    this.pseudonyms.set(studyId, codes)
    return new Map(codes)
  }
  async hasConsent(accountId: string, studyId: string, provider: string) {
    return this.consents.has(`${accountId}/${studyId}/${provider}`)
  }
  async saveConsent(accountId: string, studyId: string, provider: string) {
    this.consents.add(`${accountId}/${studyId}/${provider}`)
  }
  async startRun(run: AnalysisRun) {
    for (const r of this.analysisRuns.values())
      if (r.studyId === run.studyId && r.state === 'running') {
        if (run.startedAt.getTime() - r.heartbeatAt.getTime() < 10 * 60_000) return false
        this.analysisRuns.set(r.id, { ...r, state: 'stopped', finishedAt: run.startedAt })
      }
    this.analysisRuns.set(run.id, run)
    return true
  }
  async lastRun(studyId: string) {
    const runs = [...this.analysisRuns.values()].filter((r) => r.studyId === studyId)
    return (
      runs.find((r) => r.state === 'running') ??
      runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ??
      null
    )
  }
  async getRun(runId: string) {
    return this.analysisRuns.get(runId) ?? null
  }
  async heartbeat(runId: string, now: Date) {
    const r = this.analysisRuns.get(runId)
    if (r) this.analysisRuns.set(runId, { ...r, heartbeatAt: now })
  }
  async requestStop(runId: string) {
    const r = this.analysisRuns.get(runId)
    if (r?.state === 'running') this.analysisRuns.set(runId, { ...r, stopRequested: true })
  }
  async finishRun(runId: string, state: 'stopped' | 'done', now: Date) {
    const r = this.analysisRuns.get(runId)
    if (r?.state === 'running') this.analysisRuns.set(runId, { ...r, state, finishedAt: now })
  }
  async renameFile(studyId: string, fileId: string, name: string, modifiedAt: string | null) {
    this.files.set(
      studyId,
      (this.files.get(studyId) ?? []).map((f) =>
        f.id === fileId ? { ...f, name, modifiedAt: modifiedAt ?? f.modifiedAt } : f,
      ),
    )
  }

  async moveLink(from: Session, to: Session, expected: { from: number; to: number }) {
    const before = new Map(this.sessions)
    const cleared = this.#write(from, expected.from)
    if (cleared !== 'saved') return cleared
    const saved = this.#write(to, expected.to)
    if (saved !== 'saved') for (const [id, s] of before) this.sessions.set(id, s)
    return saved
  }
}

/**
 * The AI of the analyses (spec 009), scripted per test: answers by text, calls recorded with the
 * text sent (to check no known name leaves the app), costs per call.
 */
export class FakeAnalyzer implements Analyzer {
  provider: string | null = 'fake'
  answer: (text: string) => AnalyzerAnswer = () => ({
    interviewees: [],
    interviewers: [],
    date: null,
  })
  fail = false
  readonly calls: { accountId: string; ref: string; text: string }[] = []
  /** USD per call, recorded by ref like the usage ledger. */
  costPerCall = 0.01

  async analyze(accountId: string, ref: string, text: string) {
    if (!this.provider) throw new AiUnavailable()
    this.calls.push({ accountId, ref, text })
    if (this.fail) throw new Error('provider down')
    return this.answer(text)
  }
  async providerOf() {
    return this.provider
  }
  async estimate(_accountId: string, inputChars: number) {
    return this.provider ? inputChars / 1_000_000 : null
  }
  async costs(refs: readonly string[]) {
    return new Map(
      refs.map((ref) => [ref, this.calls.filter((c) => c.ref === ref).length * this.costPerCall]),
    )
  }
}

/** The ingestion module wired on fakes: a fake Drive, an in-memory store, jobs run on demand. */
export class InMemoryIngestion {
  readonly store = new InMemoryIngestionStore()
  readonly drive = new InMemoryDrive()
  /** Study id → account ids that can see it (the project's team). */
  readonly studies = new Map<string, string[]>()
  /** Study id → its schedule (spec 006), for every person who can see the study. */
  readonly schedules = new Map<string, PlannedSummary[]>()
  readonly memberIds = new Set<string>(['alice', 'bob', 'admin'])
  /** Simulates a schedule the research module could not read. */
  scheduleUnreadable = false
  /** Study id → type, `interviews` when not set. */
  readonly studyTypes = new Map<string, string>()
  readonly jobs: InventoryJob[] = []
  readonly analysisJobs: AnalysisJob[] = []
  readonly analyzer = new FakeAnalyzer()
  /** Team members (spec 009): id and name, the team of every study. */
  readonly team: { id: string; name: string }[] = []
  /** Studies whose names and titles use pseudonyms. */
  readonly anonymised = new Set<string>()
  /** Simulates a queue refusing the job (an equivalent one is still queued). */
  refuseJobs = false
  readonly clock: Clock & { advance(ms: number): void }
  readonly deps: IngestionDeps
  readonly commands: ReturnType<typeof makeSourceCommands>
  readonly queries: ReturnType<typeof makeSourceQueries>
  readonly gate: ReturnType<typeof makeStudyActionGate>
  readonly sessions: ReturnType<typeof makeSessionCommands>
  readonly sessionQueries: ReturnType<typeof makeSessionQueries>
  readonly run: ReturnType<typeof makeRunInventory>
  readonly analysis: ReturnType<typeof makeAnalysisCommands>
  readonly rename: ReturnType<typeof makeRenameCommands>

  constructor(
    clock: Clock & { advance(ms: number): void } = fixedClock(new Date()),
    options: { configured?: boolean } = {},
  ) {
    this.clock = clock
    this.deps = {
      store: this.store,
      studies: {
        getStudyAccess: async (accountId, studyId) =>
          this.studies.get(studyId)?.includes(accountId)
            ? {
                role: accountId === 'admin' ? 'admin' : 'member',
                type: this.studyTypes.get(studyId) ?? 'interviews',
                teamId: 'team',
                anonymised: this.anonymised.has(studyId),
              }
            : null,
      },
      schedule: {
        list: async (accountId, studyId) =>
          !this.scheduleUnreadable && this.studies.get(studyId)?.includes(accountId)
            ? (this.schedules.get(studyId) ?? [])
            : null,
        update: async (_actor, studyId, id, change) => {
          const rows = this.schedules.get(studyId) ?? []
          if (!rows.some((p) => p.id === id)) return false
          this.schedules.set(
            studyId,
            rows.map((p) => (p.id === id ? { ...p, ...change, version: p.version + 1 } : p)),
          )
          return true
        },
      },
      members: {
        exist: async (ids) => ids.every((id) => this.memberIds.has(id)),
        ofTeam: async () => this.team,
      },
      analyzer: this.analyzer,
      enqueueAnalysis: async (job) => {
        if (this.refuseJobs) return false
        this.analysisJobs.push(job)
        return true
      },
      drive:
        options.configured === false ? null : { gateway: this.drive, authorization: this.drive },
      cipher: createTokenCipher(
        'test-secret-of-at-least-thirty-two-chars',
        CIPHER_PURPOSES.sourceConnections,
      ),
      enqueueInventory: async (job) => {
        if (this.refuseJobs) return false
        this.jobs.push(job)
        return true
      },
      clock,
      log: { warn: () => undefined, error: () => undefined },
    }
    this.commands = makeSourceCommands(this.deps)
    this.queries = makeSourceQueries(this.deps)
    this.gate = makeStudyActionGate(this.deps)
    this.sessions = makeSessionCommands(this.deps)
    this.sessionQueries = makeSessionQueries(this.deps)
    this.run = makeRunInventory(this.deps)
    this.analysis = makeAnalysisCommands(this.deps)
    this.rename = makeRenameCommands(this.deps, makeStudyFiles(this.deps, this.drive.documents))
  }

  async runAnalysisJobs(): Promise<void> {
    while (this.analysisJobs.length > 0) {
      const job = this.analysisJobs.shift()
      if (job) await this.analysis.runJob(job)
    }
  }

  async runJobs(): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()
      if (job) await this.run(job)
    }
  }
}
