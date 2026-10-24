import type { Clock } from '@goodresearch/shared'
import { fixedClock, newId } from '@goodresearch/shared'
import { makeRunInventory } from '../../application/commands/run-inventory.ts'
import { makeSourceCommands } from '../../application/commands/source-commands.ts'
import type {
  IngestionDeps,
  IngestionStore,
  InventoryFailure,
  InventoryJob,
  OauthState,
  SourceConnection,
  StudySource,
} from '../../application/ports.ts'
import { makeSourceQueries, makeStudyActionGate } from '../../application/queries/source-queries.ts'
import type { FolderAccessResult } from '../../domain/folder-access.ts'
import { type InventoryRun, isActiveRun } from '../../domain/inventory-run.ts'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { createTokenCipher } from '../../infrastructure/token-cipher.ts'
import { InMemoryDrive } from './in-memory-drive.ts'

/** Same rules as the Drizzle store, including run-scoped writes. */
export class InMemoryIngestionStore implements IngestionStore {
  readonly connections = new Map<string, SourceConnection>()
  readonly states = new Map<string, OauthState>()
  readonly sources = new Map<string, StudySource>()
  readonly runs = new Map<string, string | null>()
  readonly files = new Map<string, InventoryFile[]>()
  readonly access = new Map<string, { result: FolderAccessResult; checkedAt: Date }>()

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
    for (const key of this.access.keys())
      if (key.startsWith(`${s.studyId}:`)) this.access.delete(key)
  }
  async deleteSource(id: string) {
    this.sources.delete(id)
    this.files.delete(id)
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
  ) {
    const s = this.sources.get(run.studyId)
    if (!s || !this.#isCurrent(run)) return false
    this.files.set(run.studyId, [...files])
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
  async accountName(id: string) {
    return id
  }
}

/** The ingestion module wired on fakes: a fake Drive, an in-memory store, jobs run on demand. */
export class InMemoryIngestion {
  readonly store = new InMemoryIngestionStore()
  readonly drive = new InMemoryDrive()
  /** Study id → account ids that can see it (the project's team). */
  readonly studies = new Map<string, string[]>()
  readonly jobs: InventoryJob[] = []
  /** Simulates a queue refusing the job (an equivalent one is still queued). */
  refuseJobs = false
  readonly clock: Clock & { advance(ms: number): void }
  readonly deps: IngestionDeps
  readonly commands: ReturnType<typeof makeSourceCommands>
  readonly queries: ReturnType<typeof makeSourceQueries>
  readonly gate: ReturnType<typeof makeStudyActionGate>
  readonly run: ReturnType<typeof makeRunInventory>

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
            ? { role: accountId === 'admin' ? 'admin' : 'member' }
            : null,
      },
      drive:
        options.configured === false ? null : { gateway: this.drive, authorization: this.drive },
      cipher: createTokenCipher('test-secret-of-at-least-thirty-two-chars'),
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
    this.run = makeRunInventory(this.deps)
  }

  async runJobs(): Promise<void> {
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()
      if (job) await this.run(job)
    }
  }
}
