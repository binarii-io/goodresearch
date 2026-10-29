import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'
import { SessionLanguage } from './sessions.ts'

/** Spec 010: the Enrichment phase and the team lexicon. */
export const TermKind = z.enum(['domain', 'suspect'])
export const TermCategory = z.enum([
  'product',
  'organisation',
  'place',
  'acronym',
  'jargon',
  'role',
  'person',
  'other',
])
/** Every occurrence is the term, or each one is judged in its context (verdicts). */
export const TermScope = z.enum(['global', 'case-by-case'])
/** `unsure`: the person cannot tell yet; Cleaning leaves the place to decide. */
export const Verdict = z.enum(['yes', 'no', 'unsure'])
export const TermStatus = z.enum(['proposed', 'accepted', 'edited', 'rejected', 'merged'])
export const VariantStatus = z.enum(['proposed', 'accepted', 'rejected'])
export const TermOrigin = z.enum(['rules', 'ai'])

export const EnrichmentState = z.enum(['no-transcript', 'not-read', 'changed', 'to-decide', 'read'])

export const LexiconFailure = z.enum([
  'FILE_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_UNAVAILABLE',
  'UNREADABLE_FORMAT',
  'TOO_LONG',
  'NO_TRANSCRIPT',
  'INTERRUPTED',
  'STOPPED',
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
])

export const LexiconRunPhase = z.enum(['import', 'candidates', 'ai', 'counting', 'finished'])
export const ReadingState = z.enum(['waiting', 'reading', 'done', 'failed'])

const PersonRef = z.object({ id: z.string(), name: z.string() })

export const EnrichmentInterview = z
  .object({
    sessionId: Id,
    title: z.string(),
    interviewDate: z.string().nullable(),
    state: EnrichmentState,
    /** Proposed terms or variants found in it. */
    toDecide: z.number().int(),
    readAt: Timestamp.nullable(),
    /** While a reading covers it. */
    reading: ReadingState.nullable(),
    failure: LexiconFailure.nullable(),
  })
  .meta({ id: 'EnrichmentInterview' })

export const LexiconRunView = z
  .object({
    id: Id,
    phase: LexiconRunPhase,
    total: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
    /** Candidates over the limit of a reading (research R4). */
    leftOut: z.number().int(),
    /** The AI part failed: the interviews were read, some terms may be missing. */
    failure: LexiconFailure.nullable(),
    startedBy: PersonRef.nullable(),
    finished: z.boolean(),
  })
  .meta({ id: 'LexiconRunView' })

export const Enrichment = z
  .object({
    interviews: z.array(EnrichmentInterview),
    /** Interviews of the study still to validate in Fieldwork. */
    toValidate: z.number().int(),
    counts: z.object({
      read: z.number().int(),
      toDecide: z.number().int(),
      accepted: z.number().int(),
    }),
    run: LexiconRunView.nullable(),
    /** USD, every account; null when a price is unknown. */
    lastRunCost: z.number().nullable(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    anonymised: z.boolean(),
  })
  .meta({ id: 'Enrichment' })

export const TermVariant = z
  .object({
    spelling: z.string(),
    status: VariantStatus,
    origin: z.enum(['rules', 'ai', 'merge']),
  })
  .meta({ id: 'TermVariant' })

/** An excerpt around one occurrence: the words before, the term as written, the words after. */
export const TermQuote = z
  .object({
    before: z.string(),
    match: z.string(),
    after: z.string(),
    /** The place, to give a verdict on it. */
    segmentId: z.string(),
    offset: z.number().int(),
    verdict: Verdict.nullable(),
  })
  .meta({ id: 'TermQuote' })

export const TermOccurrence = z
  .object({
    sessionId: Id,
    title: z.string(),
    /** Every occurrence in the interview; the quotes may be fewer (50 kept per spelling). */
    count: z.number().int(),
    /** Verdicts given in this interview. */
    yes: z.number().int(),
    no: z.number().int(),
    unsure: z.number().int(),
    quotes: z.array(TermQuote),
  })
  .meta({ id: 'TermOccurrence' })

/** Every occurrence of one term in the study (the term dialog). */
export const TermOccurrences = z
  .object({ occurrences: z.array(TermOccurrence) })
  .meta({ id: 'TermOccurrences' })

export const LexiconTerm = z
  .object({
    id: Id,
    version: Version,
    form: z.string(),
    kind: TermKind,
    correction: z.string().nullable(),
    category: TermCategory,
    definition: z.string().nullable(),
    language: SessionLanguage,
    scope: TermScope,
    status: TermStatus,
    origin: TermOrigin,
    quote: z.string().nullable(),
    variants: z.array(TermVariant),
    /** In this study's validated interviews, with up to 3 quotes each. */
    occurrences: z.array(TermOccurrence),
    /** The team's other studies where it was found: a count only (FR-017). */
    otherStudies: z.number().int(),
    decidedBy: PersonRef.nullable(),
    decidedAt: Timestamp.nullable(),
  })
  .meta({ id: 'LexiconTerm' })

export const LexiconPage = z
  .object({
    terms: z.array(LexiconTerm),
    next: z.string().nullable(),
    total: z.number().int(),
    /** Terms per page: the cursor is the offset of a page. */
    pageSize: z.number().int(),
  })
  .meta({ id: 'LexiconPage' })

export const LexiconQuery = z.object({
  status: z.enum(['to-decide', 'accepted', 'rejected', 'all']).optional(),
  kind: TermKind.optional(),
  category: TermCategory.optional(),
  language: SessionLanguage.optional(),
  sessionId: Id.optional(),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
})

export const LexiconEstimate = z
  .object({
    interviews: z.number().int(),
    /** What it should cost with usual answers (the AI may answer longer); null without a price. */
    estimatedCost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'LexiconEstimate' })

export const StartLexiconRun = z
  .object({
    consent: z.boolean().optional(),
    /** Read again the interviews already read. */
    all: z.boolean().optional(),
    /** Only these interviews, read again whatever their state. */
    sessionIds: z.array(Id).min(1).max(500).optional(),
  })
  .meta({ id: 'StartLexiconRun' })

export const LexiconEstimateQuery = z.object({
  all: z.enum(['true', 'false']).optional(),
  /** One interview only (read again whatever its state). */
  sessionId: Id.optional(),
})

export const LexiconRunStarted = z.object({ runId: Id }).meta({ id: 'LexiconRunStarted' })

export const LexiconRunParams = z.object({ studyId: Id, runId: Id })
export const LexiconReadingParams = z.object({ studyId: Id, runId: Id, sessionId: Id })
export const TermParams = z.object({ studyId: Id, termId: Id })

const Spelling = z.string().trim().min(1).max(80)

export const TermFields = z.object({
  form: Spelling,
  kind: TermKind,
  correction: Spelling.nullable(),
  category: TermCategory,
  definition: z.string().trim().max(200).nullable(),
  scope: TermScope.optional(),
})

export const DecideTerm = z
  .object({
    version: Version,
    decision: z.enum(['accept', 'reject', 'reopen', 'edit']),
    /** With `edit`. */
    fields: TermFields.optional(),
    variants: z
      .array(z.object({ spelling: Spelling, status: z.enum(['accepted', 'rejected']) }))
      .max(50)
      .optional(),
  })
  .meta({ id: 'DecideTerm' })

export const MergeTerms = z
  .object({ version: Version, into: z.object({ termId: Id, version: Version }) })
  .meta({ id: 'MergeTerms' })

export const BulkDecision = z
  .object({
    decision: z.enum(['accept', 'reject']),
    terms: z
      .array(z.object({ termId: Id, version: Version }))
      .min(1)
      .max(200),
  })
  .meta({ id: 'BulkDecision' })

export const BulkResult = z
  .object({ done: z.number().int(), changed: z.number().int() })
  .meta({ id: 'BulkResult' })

export const JudgeOccurrence = z
  .object({
    sessionId: Id,
    segmentId: z.string().min(1).max(64),
    offset: z.number().int().nonnegative(),
    /** null takes the verdict back. */
    verdict: Verdict.nullable(),
  })
  .meta({ id: 'JudgeOccurrence' })
