import type { TermLanguage } from './candidates.ts'
import { hasUnsplitTurns, type Segment } from './segments.ts'

/** The imported text of a validated interview (spec 010 FR-004): its raw version, never edited. */
export type Transcript = {
  readonly sessionId: string
  readonly studyId: string
  readonly fileId: string
  /** The file's version in Drive when imported: imported again only when it differs. */
  readonly fileModifiedAt: string | null
  readonly language: TermLanguage
  readonly segments: readonly Segment[]
  readonly importedBy: string
  readonly importedAt: Date
  /** When a reading went through to the end on it (terms found and counted); null until then. */
  readonly readAt: Date | null
}

export type LexiconFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'
  | 'INTERRUPTED'
  | 'STOPPED'
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'

export type Reading = {
  readonly sessionId: string
  readonly state: 'waiting' | 'reading' | 'done' | 'failed'
  readonly failure?: LexiconFailure
}

export type RunPhase = 'import' | 'candidates' | 'ai' | 'counting' | 'finished'

/** One "Find terms" over a study (research R8). */
export type LexiconRun = {
  readonly id: string
  readonly studyId: string
  readonly teamId: string
  readonly startedBy: string
  readonly sessions: readonly Reading[]
  readonly phase: RunPhase
  readonly stopRequested: boolean
  /** Interviews a person took out of the reading while it imported them (written only by them). */
  readonly stoppedSessions: readonly string[]
  /** Candidates over the limit (research R4). */
  readonly leftOut: number
  /** Batches of words sent to the AI, and how many it answered: where a long reading stands. */
  readonly batchesTotal: number
  readonly batchesDone: number
  /** A failure of the AI part: the interviews were read, some terms may be missing. */
  readonly failure: LexiconFailure | null
  readonly startedAt: Date
  readonly heartbeatAt: Date
  readonly finishedAt: Date | null
}

/** A run without heartbeat for this long is stale and can be replaced (spec 009 R6). */
export const RUN_STALE_MS = 10 * 60_000

export const isLive = (run: LexiconRun | null, now: Date): run is LexiconRun =>
  run !== null &&
  run.finishedAt === null &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

/** The ledger ref of a run's AI calls: the cost of a reading is the sum of their entries. */
export const runRef = (runId: string) => `lexicon-reading:${runId}`

/** A run that stopped without finishing: its interviews still waiting or reading are interrupted. */
export const interrupted = (run: LexiconRun, now: Date): LexiconRun => ({
  ...run,
  phase: 'finished',
  finishedAt: now,
  // An interview a person took out stays taken out.
  sessions: withStops(run).sessions.map((s) =>
    s.state === 'waiting' || s.state === 'reading'
      ? { sessionId: s.sessionId, state: 'failed', failure: 'INTERRUPTED' }
      : s,
  ),
})

/**
 * One interview can be taken out of a reading while it waits or is imported: after that its words
 * are among the candidates sent together with the others'.
 */
export const canStopReading = (run: LexiconRun, sessionId: string): boolean =>
  run.finishedAt === null &&
  run.phase === 'import' &&
  run.sessions.some(
    (s) => s.sessionId === sessionId && (s.state === 'waiting' || s.state === 'reading'),
  )

/** The run with the interviews a person stopped shown as stopped, whatever the reading last wrote. */
export const withStops = (run: LexiconRun): LexiconRun => ({
  ...run,
  sessions: run.sessions.map((s) =>
    run.stoppedSessions.includes(s.sessionId) && (s.state === 'waiting' || s.state === 'reading')
      ? { sessionId: s.sessionId, state: 'failed', failure: 'STOPPED' }
      : s,
  ),
})

/**
 * A session needs reading when it was never imported, its file changed in Drive since, or its turns
 * were read by an older rule (`hasUnsplitTurns`).
 */
export const fileChanged = (
  s: {
    readonly transcript: { readonly fileId: string; readonly modifiedAt: string | null } | null
  },
  imported: Transcript | undefined,
): boolean =>
  s.transcript !== null &&
  (!imported ||
    imported.fileId !== s.transcript.fileId ||
    imported.fileModifiedAt !== s.transcript.modifiedAt ||
    hasUnsplitTurns(imported.segments))

/**
 * A session to read: never imported, its file changed since, or a reading stopped or failed before
 * its end (review of PR #10).
 */
export const needsReading = (
  s: {
    readonly transcript: { readonly fileId: string; readonly modifiedAt: string | null } | null
  },
  imported: Transcript | undefined,
): boolean => s.transcript !== null && (fileChanged(s, imported) || !imported?.readAt)
