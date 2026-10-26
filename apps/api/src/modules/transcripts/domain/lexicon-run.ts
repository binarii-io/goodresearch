import type { TermLanguage } from './candidates.ts'
import type { Segment } from './segments.ts'

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
  /** Candidates over the limit (research R4). */
  readonly leftOut: number
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
  sessions: run.sessions.map((s) =>
    s.state === 'waiting' || s.state === 'reading'
      ? { sessionId: s.sessionId, state: 'failed', failure: 'INTERRUPTED' }
      : s,
  ),
})

/** A session needs reading when it was never imported or its file changed in Drive since. */
export const fileChanged = (
  s: {
    readonly transcript: { readonly fileId: string; readonly modifiedAt: string | null } | null
  },
  imported: Transcript | undefined,
): boolean =>
  s.transcript !== null &&
  (!imported ||
    imported.fileId !== s.transcript.fileId ||
    imported.fileModifiedAt !== s.transcript.modifiedAt)

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
