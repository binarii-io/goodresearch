import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

/** Spec 012: the first step of the Analysis phase, verbatims then facts per interview. */
export const FactsState = z.enum([
  'no-transcript',
  'not-clean',
  'not-analysed',
  'to-analyse-again',
  'to-decide',
  'done',
])
export const FactsFailure = z.enum([
  'FILE_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_UNAVAILABLE',
  'UNREADABLE_FORMAT',
  'TOO_LONG',
  'NO_TRANSCRIPT',
  'NOT_CLEAN',
  'INTERRUPTED',
  'STOPPED',
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
])
export const FactsReadingState = z.enum(['waiting', 'verbatims', 'facts', 'done', 'failed'])
export const Polarity = z.enum(['positive', 'negative', 'neutral'])
export const FactStatus = z.enum(['proposed', 'accepted', 'edited', 'rejected'])
export const FactOrigin = z.enum(['ai', 'person'])
export const Translation = z.enum(['done', 'translating', 'not-translated'])
export const SpeakerRole = z.enum(['interviewee', 'interviewer', 'unknown'])

const Who = z.object({ id: z.string(), name: z.string().nullable() })

export const FactsInterview = z
  .object({
    sessionId: Id,
    title: z.string(),
    interviewDate: z.string().nullable(),
    state: FactsState,
    verbatims: z.number().int(),
    facts: z.object({
      toDecide: z.number().int(),
      accepted: z.number().int(),
      rejected: z.number().int(),
    }),
    /** Verbatims no longer found in the analysed text. */
    lost: z.number().int(),
    readAt: Timestamp.nullable(),
    /** What this interview's readings and translations cost (USD, every account). */
    cost: z.number().nullable(),
    failure: FactsFailure.nullable(),
    /** While a reading covers it: where its own reading stands, and whether it can be taken out. */
    reading: z
      .object({
        state: FactsReadingState,
        chunks: z.number().int(),
        chunksDone: z.number().int(),
        stoppable: z.boolean(),
      })
      .nullable(),
  })
  .meta({ id: 'FactsInterview' })

export const FactsRunView = z
  .object({
    id: Id,
    total: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
    chunks: z.number().int(),
    chunksDone: z.number().int(),
    /** Dropped by the app's checks (FR-005, FR-006). */
    leftOut: z.object({ verbatims: z.number().int(), facts: z.number().int() }),
    failure: FactsFailure.nullable(),
    startedBy: Who,
    finished: z.boolean(),
  })
  .meta({ id: 'FactsRunView' })

export const FactsOverview = z
  .object({
    interviews: z.array(FactsInterview),
    counts: z.object({ done: z.number().int(), toDecide: z.number().int() }),
    run: FactsRunView.nullable(),
    lastRunCost: z.number().nullable(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    anonymised: z.boolean(),
    textAnalysed: z.enum(['with-corrections', 'clean-only']),
  })
  .meta({ id: 'FactsOverview' })

export const FactsEstimateQuery = z.object({
  sessionId: Id.optional(),
  all: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const FactsEstimate = z
  .object({
    interviews: z.number().int(),
    chunks: z.number().int(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'FactsEstimate' })

export const StartFactsRun = z
  .object({
    all: z.boolean(),
    consent: z.boolean(),
    /** Only these interviews, read again in full whatever their state. */
    sessionIds: z.array(Id).min(1).max(500).optional(),
  })
  .meta({ id: 'StartFactsRun' })

export const FactsRunStarted = z.object({ runId: Id }).meta({ id: 'FactsRunStarted' })
export const FactsRunParams = z.object({ studyId: Id, runId: Id })
export const FactsReadingParams = z.object({ studyId: Id, runId: Id, sessionId: Id })
export const FactsInterviewParams = z.object({ studyId: Id, sessionId: Id })

export const Statement = z.object({ en: z.string(), fr: z.string() }).meta({ id: 'Statement' })
export const Theme = z.object({ id: Id, title: z.string() }).meta({ id: 'Theme' })

export const Verbatim = z
  .object({
    id: Id,
    segmentId: z.string(),
    offset: z.number().int(),
    length: z.number().int(),
    text: z.string(),
    /** The pseudonym under anonymisation, else the name; null when the speaker is to attribute. */
    participant: z.string().nullable(),
    reason: z.string().nullable(),
    origin: FactOrigin,
    /** No longer found in the analysed text. */
    lost: z.boolean(),
    facts: z.array(Id),
  })
  .meta({ id: 'Verbatim' })

export const Fact = z
  .object({
    id: Id,
    sessionId: Id,
    interviewTitle: z.string(),
    statement: Statement,
    translation: Translation,
    polarity: Polarity,
    /** null: "Other". */
    theme: Theme.nullable(),
    verbatims: z.array(
      z.object({
        id: Id,
        text: z.string(),
        segmentId: z.string(),
        participant: z.string().nullable(),
        lost: z.boolean(),
      }),
    ),
    participants: z.array(z.string()),
    origin: FactOrigin,
    status: FactStatus,
    decidedBy: Who.nullable(),
    decidedAt: Timestamp.nullable(),
    version: Version,
  })
  .meta({ id: 'Fact' })

export const FactsTurn = z
  .object({
    id: z.string(),
    speaker: z.string().nullable(),
    role: SpeakerRole,
    start: z.number().nullable(),
    text: z.string(),
  })
  .meta({ id: 'FactsTurn' })

export const InterviewFacts = z
  .object({
    sessionId: Id,
    title: z.string(),
    state: FactsState,
    anonymised: z.boolean(),
    cost: z.number().nullable(),
    /** null: no analysed text (no transcript, or not clean yet). */
    turns: z.array(FactsTurn).nullable(),
    verbatims: z.array(Verbatim),
    facts: z.array(Fact),
    /** Speaker labels to attribute, and the interviewees to choose from. */
    speakers: z.array(z.object({ label: z.string(), participant: z.string().nullable() })),
    participants: z.array(z.object({ code: z.string(), label: z.string() })),
    themes: z.array(Theme),
  })
  .meta({ id: 'InterviewFacts' })

export const FactsQuery = z.object({
  status: z.enum(['to-decide', 'accepted', 'rejected', 'all']).optional(),
  theme: z.string().max(64).optional(),
  polarity: Polarity.optional(),
  participant: z.string().max(64).optional(),
  sessionId: Id.optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
})

export const FactsPage = z
  .object({
    facts: z.array(Fact),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    themes: z.array(Theme),
    participants: z.array(z.object({ code: z.string(), label: z.string() })),
    interviews: z.array(z.object({ sessionId: Id, title: z.string() })),
  })
  .meta({ id: 'FactsPage' })

const StatementText = z.string().trim().min(1).max(200)

export const CreateFact = z
  .object({
    sessionId: Id,
    /** At least one language; the other is translated. */
    statement: z.object({ en: StatementText.optional(), fr: StatementText.optional() }),
    polarity: Polarity,
    themeId: Id.nullable(),
    verbatims: z.array(Id).min(1).max(50),
  })
  .meta({ id: 'CreateFact' })

export const DecideFact = z
  .object({
    decision: z.enum(['accept', 'reject', 'edit']),
    version: Version,
    statement: z.object({ en: StatementText.optional(), fr: StatementText.optional() }).optional(),
    polarity: Polarity.optional(),
    themeId: Id.nullable().optional(),
    verbatims: z.array(Id).min(1).max(50).optional(),
  })
  .meta({ id: 'DecideFact' })

export const AcceptFacts = z
  .object({
    facts: z
      .array(z.object({ id: Id, version: Version }))
      .min(1)
      .max(500),
  })
  .meta({ id: 'AcceptFacts' })

export const FactsBulkResult = z
  .object({ done: z.number().int(), changed: z.number().int() })
  .meta({ id: 'FactsBulkResult' })

export const FactParams = z.object({ studyId: Id, factId: Id })

export const AddVerbatim = z
  .object({
    segmentId: z.string().min(1).max(64),
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive().max(5_000),
    /** Attach it to this fact (checked with its version). */
    fact: z.object({ id: Id, version: Version }).optional(),
  })
  .meta({ id: 'AddVerbatim' })

export const ResizeVerbatim = z
  .object({
    /** The turn the verbatim shows in now (its place may have moved, research R3). */
    segmentId: z.string().min(1).max(64).optional(),
    offset: z.number().int().nonnegative(),
    length: z.number().int().positive().max(5_000),
  })
  .meta({ id: 'ResizeVerbatim' })

export const VerbatimParams = z.object({ studyId: Id, sessionId: Id, verbatimId: Id })

export const AttributeSpeaker = z
  .object({
    label: z.string().min(1).max(200),
    /** An interviewee's code, or `interviewer`. */
    participant: z.string().min(1).max(64),
  })
  .meta({ id: 'AttributeSpeaker' })
