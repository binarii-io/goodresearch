import { z } from 'zod'
import { Id, Language, Timestamp, Version } from './common.ts'
import { SessionLanguage } from './sessions.ts'

/** Spec 011: Cleaning, the second step of the Enrichment phase. */
export const CleaningState = z.enum([
  'no-transcript',
  'not-cleaned',
  'to-redo',
  'to-decide',
  'lexicon-changed',
  'clean',
  'published',
  'out-of-date',
])
export const CleaningMode = z.enum(['lexicon', 'ai'])
export const CleaningFailure = z.enum([
  'FILE_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_UNAVAILABLE',
  'UNREADABLE_FORMAT',
  'TOO_LONG',
  'NO_TRANSCRIPT',
  'INTERRUPTED',
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
])
export const CorrectionKind = z.enum(['term', 'transcription', 'speaker', 'name'])
export const CorrectionSource = z.enum(['person', 'lexicon', 'name', 'ai-lexicon', 'ai-other'])
export const CorrectionStatus = z.enum(['proposed', 'accepted', 'edited', 'rejected'])
export const CorrectionTarget = z.enum(['text', 'speaker'])
export const Confidence = z.enum(['high', 'medium', 'low'])

const Who = z.object({ id: z.string(), name: z.string().nullable() })
const Published = z.object({ webLink: z.string(), versionNumber: z.number().int() })

export const CleaningInterview = z
  .object({
    sessionId: Id,
    title: z.string(),
    interviewDate: z.string().nullable(),
    state: CleaningState,
    toDecide: z.number().int(),
    accepted: z.number().int(),
    cleanedAt: Timestamp.nullable(),
    /** What this interview's cleanings cost (USD, every account); null when a price is unknown. */
    cost: z.number().nullable(),
    failure: CleaningFailure.nullable(),
    published: Published.nullable(),
  })
  .meta({ id: 'CleaningInterview' })

export const CleaningRunView = z
  .object({
    id: Id,
    mode: CleaningMode,
    total: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
    chunks: z.number().int(),
    chunksDone: z.number().int(),
    /** AI corrections dropped by the app's checks (FR-006). */
    leftOut: z.number().int(),
    failure: CleaningFailure.nullable(),
    startedBy: Who,
    finished: z.boolean(),
  })
  .meta({ id: 'CleaningRunView' })

export const Cleaning = z
  .object({
    interviews: z.array(CleaningInterview),
    counts: z.object({ clean: z.number().int(), toDecide: z.number().int() }),
    run: CleaningRunView.nullable(),
    /** USD, every account; null when a price is unknown. */
    lastRunCost: z.number().nullable(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    anonymised: z.boolean(),
    folder: z.object({ name: z.string() }).nullable(),
  })
  .meta({ id: 'Cleaning' })

export const CleaningEstimateQuery = z.object({
  mode: CleaningMode,
  /** One interview only (cleaned again in full). */
  sessionId: Id.optional(),
  all: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const CleaningEstimate = z
  .object({
    interviews: z.number().int(),
    /** What the AI would read; 0 with `lexicon`. */
    chunks: z.number().int(),
    /** 0 with `lexicon`; null without a price. */
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'CleaningEstimate' })

export const StartCleaningRun = z
  .object({
    mode: CleaningMode,
    all: z.boolean(),
    consent: z.boolean(),
    /** Only these interviews, cleaned again in full whatever their state. */
    sessionIds: z.array(Id).min(1).max(500).optional(),
  })
  .meta({ id: 'StartCleaningRun' })

export const CleaningRunStarted = z.object({ runId: Id }).meta({ id: 'CleaningRunStarted' })
export const CleaningRunParams = z.object({ studyId: Id, runId: Id })
export const InterviewCleaningParams = z.object({ studyId: Id, sessionId: Id })
export const CorrectionKey = z.string().min(1).max(200)
export const CorrectionParams = z.object({ studyId: Id, sessionId: Id, key: CorrectionKey })

export const InterviewCleaningQuery = z.object({
  status: z.enum(['to-decide', 'accepted', 'rejected', 'all']).optional(),
  source: CorrectionSource.optional(),
  kind: CorrectionKind.optional(),
  confidence: Confidence.optional(),
  onlyCorrected: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v !== 'false'),
})

export const Correction = z
  .object({
    key: CorrectionKey,
    segmentId: z.string(),
    target: CorrectionTarget,
    offset: z.number().int(),
    length: z.number().int(),
    original: z.string(),
    /** What it writes (a person's edit included). */
    replacement: z.string(),
    kind: CorrectionKind,
    source: CorrectionSource,
    reason: z.string().nullable(),
    confidence: Confidence.nullable(),
    status: CorrectionStatus,
    term: z.object({ id: Id, form: z.string() }).nullable(),
    decidedBy: Who.nullable(),
    decidedAt: Timestamp.nullable(),
    /** Stored corrections only. */
    version: Version.nullable(),
    /** Hidden by a correction of higher priority at the same place. */
    overridden: z.boolean(),
  })
  .meta({ id: 'Correction' })

export const CleaningTurn = z
  .object({
    id: z.string(),
    speaker: z.string().nullable(),
    start: z.number().nullable(),
    text: z.string(),
    corrections: z.array(Correction),
  })
  .meta({ id: 'CleaningTurn' })

export const InterviewCleaning = z
  .object({
    sessionId: Id,
    title: z.string(),
    language: SessionLanguage,
    anonymised: z.boolean(),
    state: CleaningState,
    /** Of the corrections that apply now; sent back to validate. */
    fingerprint: z.string(),
    cost: z.number().nullable(),
    speakers: z.array(z.string()),
    turns: z.array(CleaningTurn),
    counts: z.object({
      toDecide: z.number().int(),
      accepted: z.number().int(),
      rejected: z.number().int(),
    }),
    versions: z.array(z.object({ number: z.number().int(), createdAt: Timestamp, createdBy: Who })),
    published: Published.nullable(),
  })
  .meta({ id: 'InterviewCleaning' })

export const DecideCorrection = z
  .object({
    decision: z.enum(['accept', 'reject', 'edit', 'reopen']),
    /** With `edit`. */
    replacement: z.string().trim().min(1).max(200).optional(),
    version: Version.optional(),
  })
  .meta({ id: 'DecideCorrection' })

export const AddCorrection = z
  .object({
    segmentId: z.string().min(1).max(64),
    target: CorrectionTarget,
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive().max(2_000),
    original: z.string().min(1).max(2_000),
    replacement: z.string().trim().min(1).max(200),
  })
  .meta({ id: 'AddCorrection' })

export const CorrectionAdded = z.object({ key: CorrectionKey }).meta({ id: 'CorrectionAdded' })

export const BulkCorrections = z
  .object({
    decision: z.enum(['accept', 'reject']),
    keys: z.array(CorrectionKey).min(1).max(500),
  })
  .meta({ id: 'BulkCorrections' })

export const BulkCorrectionsResult = z
  .object({ decided: z.number().int() })
  .meta({ id: 'BulkCorrectionsResult' })

export const ValidateClean = z
  .object({ fingerprint: z.string().min(1).max(64) })
  .meta({ id: 'ValidateClean' })
export const CleanVersionCreated = z
  .object({ number: z.number().int() })
  .meta({ id: 'CleanVersionCreated' })

export const PublishClean = z
  .object({
    /** Write over a document changed in Drive since the last publish. */
    overwrite: z.boolean(),
    /** The person's language: names the folder the first time. */
    language: Language,
  })
  .meta({ id: 'PublishClean' })

export const CleanPublished = Published.meta({ id: 'CleanPublished' })
