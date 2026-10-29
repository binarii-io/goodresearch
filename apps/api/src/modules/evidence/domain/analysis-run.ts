/** A run without heartbeat for this long died (as the Enrichment runs). */
export const RUN_STALE_MS = 10 * 60_000

export type FactsFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'
  | 'NOT_CLEAN'
  | 'INTERRUPTED'
  | 'STOPPED'
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'

export type FactsProgress = {
  readonly sessionId: string
  readonly state: 'waiting' | 'verbatims' | 'facts' | 'done' | 'failed'
  readonly chunks: number
  readonly chunksDone: number
  readonly failure?: FactsFailure
}

/** One "Find facts" over a study (spec 012 FR-012, research R10). */
export type FactsRun = {
  readonly id: string
  readonly studyId: string
  readonly teamId: string
  readonly startedBy: string
  readonly sessions: readonly FactsProgress[]
  readonly stopRequested: boolean
  /** Interviews a person took out of the reading while it ran; never cleared by the worker. */
  readonly stoppedSessions: readonly string[]
  /** Dropped by the app's checks (FR-005, FR-006). */
  readonly leftOut: { readonly verbatims: number; readonly facts: number }
  readonly failure: FactsFailure | null
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

/** The ledger ref of a reading's AI calls, per run and interview (FR-013). */
export const factsRef = (runId: string, sessionId: string) => `facts:${runId}:${sessionId}`

/** The ledger ref of the translations of an interview's facts (research R9). */
export const translationRef = (sessionId: string) => `facts-translation:${sessionId}`

export const isFactsRunLive = (run: FactsRun | null, now: Date): run is FactsRun =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/** A run that stopped without finishing: its interviews still open are interrupted. */
export const interruptedFactsRun = (run: FactsRun, now: Date): FactsRun => ({
  ...run,
  finishedAt: now,
  // An interview a person took out stays taken out.
  sessions: withFactsStops(run).sessions.map((s) =>
    s.state === 'done' || s.state === 'failed'
      ? s
      : { ...s, state: 'failed', failure: 'INTERRUPTED' },
  ),
})

const open = (s: FactsProgress) => s.state !== 'done' && s.state !== 'failed'

/** One interview can be taken out of a reading until its own reading ends. */
export const canStopFacts = (run: FactsRun, sessionId: string): boolean =>
  run.finishedAt === null && run.sessions.some((s) => s.sessionId === sessionId && open(s))

/** The run with the interviews a person stopped shown as stopped, whatever the reading last wrote. */
export const withFactsStops = (run: FactsRun): FactsRun => ({
  ...run,
  sessions: run.sessions.map((s) =>
    run.stoppedSessions.includes(s.sessionId) && open(s)
      ? { ...s, state: 'failed', failure: 'STOPPED' }
      : s,
  ),
})
