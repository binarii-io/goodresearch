import { z } from 'zod'
import { Id, Version } from './common.ts'
import { StudyParams } from './research.ts'

/** Spec 016: how the interviews were conducted, and the remarks on the interviewers' sentences. */
export const EvaluationState = z.enum([
  'no-transcript',
  'not-clean',
  'speakers-not-identified',
  'not-measurable',
  'not-reviewed',
  'reviewing',
  'to-review-again',
  'reviewed',
])
export const QualityFailure = z.enum([
  'FILE_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_UNAVAILABLE',
  'UNREADABLE_FORMAT',
  'TOO_LONG',
  'NO_TRANSCRIPT',
  'NOT_CLEAN',
  'INTERRUPTED',
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
])
export const ReviewState = z.enum(['waiting', 'reading', 'done', 'failed'])
export const RemarkKind = z.enum(['leading-question', 'reformulation-with-opinion', 'opinion'])
/** A person's opinion on a remark ("avis" in French): it changes only the counts. */
export const Stance = z.enum(['agree', 'disagree'])

const Breakdown = z.object({
  agreed: z.number().int(),
  noOpinion: z.number().int(),
  disagreed: z.number().int(),
})
const ByRole = z.object({
  interviewers: z.number(),
  interviewees: z.number(),
  unknown: z.number(),
})

export const Figures = z
  .object({
    /** Words per role; computed by the app, never by the AI. */
    words: ByRole,
    /** Minutes per role; null unless every turn has a start. */
    minutes: ByRole.nullable(),
    sentences: z.number().int(),
    questions: z.number().int(),
    simpleReformulations: z.number().int(),
    leading: z.object({
      questions: Breakdown,
      reformulations: Breakdown,
      opinions: Breakdown,
    }),
    /** Dropped or reclassified by the app's checks (FR-004). */
    leftOut: z.number().int(),
    /** Turns of a speaker not identified, which the review skipped. */
    turnsSkipped: z.number().int(),
  })
  .meta({ id: 'QualityFigures' })

export const PersonRow = z
  .object({
    /** The interviewer's code, or `not-identified`. */
    key: z.string(),
    name: z.string().nullable(),
    interviews: z.number().int(),
    figures: Figures,
  })
  .meta({ id: 'QualityPersonRow' })

export const InterviewRow = z
  .object({
    sessionId: Id,
    title: z.string(),
    interviewDate: z.string().nullable(),
    interviewers: z.array(z.string()),
    state: EvaluationState,
    /** What its own row offers, on this interview alone. */
    action: z.enum(['review', 'review-again', 'review-anyway']).nullable(),
    /** Null until the interview is reviewed: no "0 of 0" before that. */
    figures: Figures.nullable(),
    /** Null when nothing is recorded, or a price is unknown. */
    cost: z.number().nullable(),
    failure: QualityFailure.nullable(),
    reading: z
      .object({
        state: ReviewState,
        chunks: z.number().int(),
        chunksDone: z.number().int(),
      })
      .nullable(),
  })
  .meta({ id: 'QualityInterviewRow' })

export const QualityRunView = z
  .object({
    id: Id,
    total: z.number().int(),
    done: z.number().int(),
    failed: z.number().int(),
    chunks: z.number().int(),
    chunksDone: z.number().int(),
    leftOut: z.number().int(),
    failure: QualityFailure.nullable(),
    finished: z.boolean(),
  })
  .meta({ id: 'QualityRunView' })

export const QualityOverview = z
  .object({
    /** Only the interviews reviewed; null before any review. */
    overall: Figures.nullable(),
    reviewed: z.number().int(),
    total: z.number().int(),
    people: z.array(PersonRow),
    interviews: z.array(InterviewRow),
    run: QualityRunView.nullable(),
    lastRunCost: z.number().nullable(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    anonymised: z.boolean(),
  })
  .meta({ id: 'QualityOverview' })

export const QualityEstimateQuery = z.object({
  sessionId: Id.optional(),
  all: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const QualityEstimate = z
  .object({
    interviews: z.number().int(),
    chunks: z.number().int(),
    cost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'QualityEstimate' })

export const StartQualityRun = z
  .object({
    all: z.boolean(),
    consent: z.boolean(),
    /** Only these interviews, whatever their state ("Review anyway"). */
    sessionIds: z.array(Id).min(1).max(500).optional(),
  })
  .meta({ id: 'StartQualityRun' })

export const QualityRunStarted = z.object({ runId: Id }).meta({ id: 'QualityRunStarted' })

export const QualityRunParams = StudyParams.extend({ runId: Id })

export const Remark = z
  .object({
    id: Id,
    sessionId: Id,
    interviewTitle: z.string(),
    /** Name, or code under anonymisation; null when not identified. */
    person: z.string().nullable(),
    personKey: z.string(),
    kind: RemarkKind,
    segmentId: z.string(),
    /** The place in the current text; null when it is no longer found. */
    offset: z.number().int().nullable(),
    length: z.number().int().nullable(),
    text: z.string(),
    before: z.string().nullable(),
    after: z.string().nullable(),
    /** Both languages for the viewer's choice; a person's reason is the same in both. */
    reason: z.object({ en: z.string(), fr: z.string() }),
    recommendation: z.string().nullable(),
    addedElement: z.string().nullable(),
    origin: z.enum(['ai', 'person']),
    stance: Stance.nullable(),
    stanceBy: z.string().nullable(),
    stanceAt: z.string().nullable(),
    lost: z.boolean(),
    version: Version,
  })
  .meta({ id: 'QualityRemark' })

export const RemarksQuery = z.object({
  person: z.string().optional(),
  sessionId: Id.optional(),
  kind: RemarkKind.optional(),
  stance: z.enum(['agree', 'disagree', 'none']).optional(),
})

export const SetStance = z
  .object({ stance: Stance.nullable(), version: Version })
  .meta({ id: 'SetStance' })

export const SimpleReformulation = z
  .object({
    id: Id,
    sessionId: Id,
    interviewTitle: z.string(),
    person: z.string().nullable(),
    personKey: z.string(),
    segmentId: z.string(),
    offset: z.number().int().nullable(),
    length: z.number().int().nullable(),
    text: z.string(),
    before: z.string().nullable(),
    after: z.string().nullable(),
  })
  .meta({ id: 'SimpleReformulation' })

export const Requalify = z
  .object({
    reason: z.string().trim().min(1).max(500),
    recommendation: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'RequalifyReformulation' })

export const RemarkList = z
  .object({ remarks: z.array(Remark), total: z.number().int() })
  .meta({ id: 'QualityRemarkList' })

export const ReformulationsQuery = z.object({
  person: z.string().optional(),
  sessionId: Id.optional(),
})

export const ReformulationList = z
  .object({ reformulations: z.array(SimpleReformulation), total: z.number().int() })
  .meta({ id: 'SimpleReformulationList' })

export const RemarkParams = StudyParams.extend({ remarkId: Id })
export const ReformulationParams = StudyParams.extend({ reformulationId: Id })
export const QualityInterviewParams = StudyParams.extend({ sessionId: Id })
export const RemarkVersionQuery = z.object({ version: z.coerce.number().int().min(1) })
export const RemarkRequalified = z.object({ remarkId: Id }).meta({ id: 'RemarkRequalified' })

/** The interview to read in the Quality tab: its text always; the rest once reviewed. */
export const QualityInterview = z
  .object({
    sessionId: Id,
    title: z.string(),
    interviewDate: z.string().nullable(),
    state: EvaluationState,
    /** Null: no transcript, or not clean yet. */
    turns: z
      .array(
        z.object({
          id: z.string(),
          speaker: z.string().nullable(),
          role: z.enum(['interviewer', 'interviewee', 'unknown']),
          start: z.number().nullable(),
          text: z.string(),
        }),
      )
      .nullable(),
    figures: Figures.nullable(),
    remarks: z.array(Remark),
    reformulations: z.array(SimpleReformulation),
    speakers: z.array(
      z.object({
        label: z.string(),
        role: z.enum(['interviewer', 'interviewee', 'unknown']),
      }),
    ),
    participants: z.array(z.object({ code: z.string(), label: z.string() })),
    cost: z.number().nullable(),
  })
  .meta({ id: 'QualityInterview' })
