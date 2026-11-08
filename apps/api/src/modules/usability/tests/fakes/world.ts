import { fixedClock } from '@goodresearch/shared'
import { makeAnalysisRun } from '../../application/commands/analysis-run.ts'
import { makeObservationCommands } from '../../application/commands/observation-commands.ts'
import type {
  AnalysisAi,
  AnalysisJob,
  AnalysisOutput,
  AnalysisRun,
  Facts,
  ProtocolOfSession,
  SessionRef,
  StagedFile,
  UsabilityDeps,
  UsabilityStore,
} from '../../application/ports.ts'
import { makeAnalysisQueries } from '../../application/queries/analysis-queries.ts'
import type { SessionAnalysis, Stage } from '../../domain/analysis.ts'
import { mergeAnalyses, type Observation } from '../../domain/observation.ts'
import type { TaskResult } from '../../domain/task-result.ts'
import type { Segment } from '../../domain/transcript.ts'

/** In memory, as the Drizzle store behaves (versions checked, decided items kept). */
export class MemoryStore implements UsabilityStore {
  analyses = new Map<string, SessionAnalysis>()
  transcripts = new Map<string, { language: string | null; segments: Segment[] }>()
  tasks = new Map<string, TaskResult>()
  observations = new Map<string, Observation>()
  screenshots = new Map<string, string>()
  runs = new Map<string, AnalysisRun>()

  async analysisOf(sessionId: string) {
    return [...this.analyses.values()].find((a) => a.sessionId === sessionId) ?? null
  }
  async analysesOf(studyId: string) {
    return [...this.analyses.values()].filter((a) => a.studyId === studyId)
  }
  async analysisById(id: string) {
    return this.analyses.get(id) ?? null
  }
  async beginAnalysis(a: SessionAnalysis) {
    const previous = await this.analysisOf(a.sessionId)
    this.analyses.set(previous?.id ?? a.id, {
      ...a,
      id: previous?.id ?? a.id,
      version: (previous?.version ?? 0) + 1,
    })
  }
  async toReviewCounts(ids: readonly string[]) {
    const counts = new Map<string, number>()
    for (const x of [...this.observations.values(), ...this.tasks.values()])
      if (ids.includes(x.analysisId) && x.status === 'proposed')
        counts.set(x.analysisId, (counts.get(x.analysisId) ?? 0) + 1)
    return counts
  }
  async restoreAnalysis(a: SessionAnalysis) {
    this.analyses.set(a.id, a)
  }
  async setStage(id: string, stage: Stage) {
    const a = this.analyses.get(id)
    if (a) this.analyses.set(id, { ...a, state: 'analysing', stage })
  }
  async failAnalysis(id: string, failure: SessionAnalysis['failure'] & string, now: Date) {
    const a = this.analyses.get(id)
    if (a)
      this.analyses.set(id, {
        ...a,
        state: failure === 'STOPPED' ? 'stopped' : 'failed',
        failure,
        finishedAt: now,
      })
  }
  async completeAnalysis(id: string, out: AnalysisOutput, now: Date) {
    const a = this.analyses.get(id)
    if (!a) return
    const previous = [...this.observations.values()].filter((o) => o.analysisId === id)
    const { keep, add } = mergeAnalyses(previous, out.observations)
    for (const o of previous) if (!keep.includes(o)) this.observations.delete(o.id)
    for (const o of add) this.observations.set(o.id, o)
    const decided = [...this.tasks.values()].filter(
      (t) => t.analysisId === id && t.status !== 'proposed',
    )
    for (const t of [...this.tasks.values()])
      if (t.analysisId === id && t.status === 'proposed') this.tasks.delete(t.id)
    for (const t of out.tasks)
      if (!decided.some((d) => d.taskId === t.taskId)) this.tasks.set(t.id, t)
    this.transcripts.set(id, { language: out.language, segments: [...out.segments] })
    this.analyses.set(id, { ...a, state: 'done', stage: null, failure: null, finishedAt: now })
  }
  async transcriptOf(id: string) {
    return this.transcripts.get(id) ?? null
  }
  async taskResultsOf(ids: readonly string[]) {
    return [...this.tasks.values()].filter((t) => ids.includes(t.analysisId))
  }
  async observationsOf(ids: readonly string[]) {
    return [...this.observations.values()].filter((o) => ids.includes(o.analysisId))
  }
  async observation(id: string) {
    return this.observations.get(id) ?? null
  }
  async taskResult(id: string) {
    return this.tasks.get(id) ?? null
  }
  async saveObservation(o: Observation, expected: number) {
    const cur = this.observations.get(o.id)
    if (!cur || cur.version !== expected) return 'stale' as const
    this.observations.set(o.id, { ...o, version: expected + 1 })
    return 'saved' as const
  }
  async addObservation(o: Observation) {
    this.observations.set(o.id, o)
  }
  async saveTaskResult(r: TaskResult, expected: number) {
    const cur = this.tasks.get(r.id)
    if (!cur || cur.version !== expected) return 'stale' as const
    this.tasks.set(r.id, { ...r, version: expected + 1 })
    return 'saved' as const
  }
  async startRun(run: AnalysisRun) {
    if ([...this.runs.values()].some((r) => r.studyId === run.studyId && r.state === 'running'))
      return false
    this.runs.set(run.id, run)
    return true
  }
  async lastRun(studyId: string) {
    return [...this.runs.values()].filter((r) => r.studyId === studyId).at(-1) ?? null
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null
  }
  async heartbeat(id: string, now: Date) {
    const r = this.runs.get(id)
    if (r) this.runs.set(id, { ...r, heartbeatAt: now })
  }
  async requestStop(id: string) {
    const r = this.runs.get(id)
    if (r) this.runs.set(id, { ...r, stopRequested: true })
  }
  async finishRun(id: string, state: 'stopped' | 'done', now: Date) {
    const r = this.runs.get(id)
    if (r) this.runs.set(id, { ...r, state, finishedAt: now })
  }
  readonly registeredAt = new Map<string, Date>()
  async registerScreenshot(key: string, studyId: string, now: Date) {
    this.screenshots.set(key, studyId)
    this.registeredAt.set(key, now)
  }
  async orphanScreenshots(registeredBefore: Date) {
    const used = new Set([...this.observations.values()].map((o) => o.screenshotKey))
    const gone = [...this.screenshots.keys()].filter(
      (k) =>
        !used.has(k) && (this.registeredAt.get(k)?.getTime() ?? 0) < registeredBefore.getTime(),
    )
    for (const k of gone) this.screenshots.delete(k)
    return gone
  }
}

export const SEGMENTS: Segment[] = [
  {
    speaker: 'Facilitator',
    startMs: 1000,
    endMs: 6000,
    text: 'Please find the report of last week.',
  },
  {
    speaker: 'Participant',
    startMs: 30_000,
    endMs: 36_000,
    text: "Hmm, where's the export? I would expect it here.",
  },
  {
    speaker: 'Participant',
    startMs: 90_000,
    endMs: 95_000,
    text: 'Found it, that was easy in the end.',
  },
]

/** Answers like the trial's models, with one quote not in the transcript (the app drops it). */
export class FakeAi implements AnalysisAi {
  calls: { stage: string; ref: string; tier?: string }[] = []
  provider: string | null = 'vertex'
  judgeVerdict: 'kept' | 'not-confirmed' | 'rejected' = 'kept'
  judgeContrary: string | null = null
  arbiterVerdict: 'kept' | 'rejected' = 'kept'
  failAt: string | null = null
  private hit(stage: string, ref: string) {
    this.calls.push({ stage, ref })
    if (this.failAt === stage) throw new Error(`${stage} failed`)
  }
  async layout(_a: string, ref: string) {
    this.hit('layout', ref)
    return { x: 0, y: 0, width: 1280, height: 720 }
  }
  async transcript(_a: string, ref: string, _f: StagedFile, span: { startMs: number }) {
    this.hit('transcript', ref)
    return {
      language: 'en',
      segments: span.startMs === 0 ? SEGMENTS.map((s) => ({ ...s })) : [],
    }
  }
  async screenLog(_a: string, ref: string) {
    this.hit('screen-log', ref)
    return [{ atMs: 30_000, screen: 'Settings menu', action: 'opens Settings' }]
  }
  async taskMap(_a: string, ref: string, input: { tasks: readonly { id: string }[] }) {
    this.hit('task-map', ref)
    return input.tasks.map((t, i) =>
      i === 0
        ? { taskId: t.id, startMs: 1000, endMs: 95_000, found: true, note: '' }
        : { taskId: t.id, startMs: null, endMs: null, found: false, note: 'Time ran out' },
    )
  }
  async task(_a: string, ref: string) {
    this.hit('task', ref)
    return {
      outcome: 'success' as const,
      path: 'Home, Settings, Reports, Export',
      ease: 6,
      assisted: false,
      observations: [
        {
          kind: 'difficulty' as const,
          momentMs: 30_000,
          text: 'Looks for the export in Settings',
          quote: "where's the export?",
          seen: 'Settings menu open',
          susItem: null,
          susValue: null,
        },
        {
          kind: 'positive' as const,
          momentMs: 90_000,
          text: 'Finds it and says it was easy',
          quote: 'that was easy in the end',
          seen: null,
          susItem: null,
          susValue: null,
        },
        {
          kind: 'verbatim' as const,
          momentMs: 60_000,
          text: 'Invented quote',
          quote: 'I love this product so much',
          seen: null,
          susItem: null,
          susValue: null,
        },
      ],
    }
  }
  async judge(_a: string, ref: string) {
    this.hit('judge', ref)
    return {
      verdict: this.judgeVerdict,
      reason: 'Seen on the frames',
      contrary: this.judgeContrary,
    }
  }
  async arbiter(_a: string, ref: string) {
    this.hit('arbiter', ref)
    return { verdict: this.arbiterVerdict, reason: 'Settled on the dense frames' }
  }
  async providerOf() {
    return this.provider
  }
  async estimate(
    _a: string,
    inputChars: number,
    outputTokens: number,
    tier: 'standard' | 'strong',
  ) {
    return this.provider
      ? (inputChars / 4 / 1e6) * (tier === 'strong' ? 2 : 0.75) + outputTokens / 1e6
      : null
  }
  async costs(refs: readonly string[]) {
    return new Map(refs.map((r) => [r, this.calls.filter((c) => c.ref === r).length * 0.01]))
  }
}

export const PROTOCOL: ProtocolOfSession = {
  version: 1,
  language: 'en',
  scenario: 'You prepare the weekly review.',
  tasks: [
    { id: 'task-1', instruction: 'Find the report of last week', criterion: 'The report is open' },
    { id: 'task-2', instruction: 'Share it with your manager', criterion: 'It is shared' },
  ],
  sus: false,
  ease: true,
}

export const session = (over: Partial<SessionRef> = {}): SessionRef => ({
  sessionId: 's1',
  studyId: 'study',
  title: 'Session one',
  state: 'validated',
  readiness: 'ready',
  protocolVersion: 1,
  video: {
    fileId: 'v1',
    name: 'one.mp4',
    modifiedAt: '2026-11-03T11:00:00Z',
    size: 1000,
    durationMs: 120_000,
  },
  participant: 'Casey Test',
  facilitators: ['Robin Sample'],
  hasPeople: true,
  ...over,
})

/** The whole module on fakes: sessions, Drive bytes, staging, ffmpeg, storage, facts. */
export class World {
  store = new MemoryStore()
  ai = new FakeAi()
  sessions: SessionRef[] = [session()]
  consents = new Set<string>()
  staged = new Set<string>()
  stagedEver: string[] = []
  workdirs = { open: 0 }
  stored = new Map<string, Uint8Array>()
  facts = new Map<string, Parameters<Facts['upsert']>[0]>()
  people: { sessionId: string; text: string }[] = []
  jobs: AnalysisJob[] = []
  /** Videos Drive stops giving in the middle of the copy. */
  readonly videoBreaks = new Set<string>()
  /** What the staging throws (the provider refusing the person's access). */
  stagingRefuses: Error | null = null
  /** Names a fact must not hold (the study's people). */
  knownNames: string[] = []
  /** The previous job is still ending: the queue refuses a new one. */
  queueRefuses = false
  missingVideo = new Set<string>()
  anonymised = false
  type = 'usability-test'
  counter = 0
  deps: UsabilityDeps
  run: ReturnType<typeof makeAnalysisRun>
  observations: ReturnType<typeof makeObservationCommands>
  queries: ReturnType<typeof makeAnalysisQueries>

  constructor() {
    this.deps = {
      store: this.store,
      sessions: {
        access: async (accountId) =>
          accountId === 'eve'
            ? { kind: 'not-found' }
            : { kind: 'full', type: this.type, anonymised: this.anonymised, teamId: 'team' },
        list: async () => this.sessions,
        one: async (_a, id) => this.sessions.find((s) => s.sessionId === id) ?? null,
        video: async (id) => {
          const s = this.sessions.find((x) => x.sessionId === id)
          return s?.video ? { studyId: s.studyId, fileId: s.video.fileId } : null
        },
        stream: async (_a, _s, fileId) =>
          this.missingVideo.has(fileId)
            ? 'not-found'
            : {
                size: 3,
                chunks: (async function* (breaks: boolean) {
                  yield new Uint8Array([1, 2, 3])
                  if (breaks) throw new Error('video no longer readable in Drive')
                })(this.videoBreaks.has(fileId)),
              },
        range: async () => null,
        hasConsent: async (a, s, p) => this.consents.has(`${a}/${s}/${p}`),
        giveConsent: async (a, s, p) => {
          this.consents.add(`${a}/${s}/${p}`)
        },
        knownNames: async () => ['Casey Test', 'Robin Sample'],
        proposePeopleFromText: async (_a, sessionId, text) => {
          this.people.push({ sessionId, text })
        },
      },
      protocols: { version: async (_s, v) => (v === 1 ? PROTOCOL : null) },
      staging: {
        put: async (_a, name, mimeType, chunks) => {
          if (this.stagingRefuses) throw this.stagingRefuses
          for await (const _ of chunks) {
            // The bytes go through, as to the real storage.
          }
          this.staged.add(name)
          this.stagedEver.push(name)
          return { uri: `gs://staging/${name}`, mimeType }
        },
        source: async (_a, file) => ({ input: file.uri, headers: {} }),
        remove: async (_a, files) => {
          for (const f of files) this.staged.delete(f.uri.replace('gs://staging/', ''))
        },
      },
      media: {
        workdir: async () => {
          this.workdirs.open++
          return { path: '/tmp/fake', release: async () => void this.workdirs.open-- }
        },
        durationMs: async () => 120_000,
        frames: async (_v, at) => at.map((atMs) => ({ atMs, jpeg: new Uint8Array([1, 2, 3]) })),
        keyframes: async () =>
          [0, 3000, 30_000, 90_000].map((atMs) => ({ atMs, path: `keyframe-${atMs}.jpg` })),
        take: async (files) => files.map((f) => ({ atMs: f.atMs, jpeg: new Uint8Array([1]) })),
        audio: async function* () {
          yield new Uint8Array([1])
        },
      },
      ai: this.ai,
      screens: {
        put: async (key, jpeg) => void this.stored.set(key, jpeg),
        get: async (key) => this.stored.get(key) ?? null,
        deleteByPrefix: async (prefix) => {
          let n = 0
          for (const k of [...this.stored.keys()])
            if (k.startsWith(prefix)) n += this.stored.delete(k) ? 1 : 0
          return n
        },
      },
      facts: {
        upsert: async (input) => {
          if (this.knownNames.some((n) => input.statement.includes(n)))
            return { ok: false, error: 'NAME_IN_STATEMENT' }
          this.facts.set(input.observationId, input)
          return { ok: true, value: { factId: `fact-${input.observationId}` } }
        },
        withdraw: async (id) => void this.facts.delete(id),
      },
      enqueue: async (job) => {
        if (this.queueRefuses) return false
        this.jobs.push(job)
        return true
      },
      clock: fixedClock(new Date('2026-11-08T10:00:00Z')),
      newId: () => `id${++this.counter}`,
      log: { warn: () => undefined, error: () => undefined },
    }
    this.run = makeAnalysisRun(this.deps)
    this.observations = makeObservationCommands(this.deps)
    this.queries = makeAnalysisQueries(this.deps, this.run)
  }

  async runJobs() {
    while (this.jobs.length) {
      const job = this.jobs.shift()
      if (job) await this.run.runJob(job)
    }
  }
}
