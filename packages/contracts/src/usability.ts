import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

/** Spec 038: the analysis of usability test sessions, task by task. */

export const AnalysisState = z.enum(['waiting', 'analysing', 'done', 'failed', 'stopped'])
export const AnalysisStage = z.enum([
  'preparing',
  'transcript',
  'screen-log',
  'task-map',
  'tasks',
  'checks',
])
export const AnalysisFailureCode = z.enum([
  'VIDEO_UNREADABLE',
  'AI_PROVIDER_REQUIRED',
  'AI_RECONNECT_REQUIRED',
  'MEDIA_NOT_SUPPORTED',
  'AI_FAILED',
  'STAGING_FAILED',
  'STOPPED',
])
export const TaskOutcome = z.enum(['success', 'partial', 'failure', 'not-attempted'])
export const ObservationKind = z.enum([
  'difficulty',
  'error',
  'positive',
  'verbatim',
  'assisted',
  'sus-answer',
])
export const ObservationStatus = z.enum(['proposed', 'accepted', 'edited', 'rejected'])

export const UsabilityStudyAnalysis = z
  .object({
    sessions: z.array(
      z.object({
        sessionId: Id,
        title: z.string(),
        participant: z.string().nullable(),
        videoMinutes: z.number().int().nullable(),
        readiness: z.string().nullable(),
        /** USD estimated for analysing this session alone; null when a price is unknown. */
        estimate: z.number().nullable(),
        analysis: z
          .object({
            state: AnalysisState,
            stage: AnalysisStage.nullable(),
            failure: AnalysisFailureCode.nullable(),
            outOfDate: z.boolean(),
            cost: z.number().nullable(),
            toReview: z.number().int(),
          })
          .nullable(),
      }),
    ),
    run: z.object({ id: Id, stopRequested: z.boolean(), total: z.number().int() }).nullable(),
    estimate: z.object({
      count: z.number().int(),
      minutes: z.number().int(),
      cost: z.number().nullable(),
    }),
    consentNeeded: z.boolean(),
    provider: z.object({ kind: z.string().nullable(), video: z.boolean() }),
    /** USD spent analysing the study's sessions, by anyone; null when a price is unknown. */
    cost: z.number().nullable(),
  })
  .meta({ id: 'UsabilityStudyAnalysis' })
export type UsabilityStudyAnalysis = z.infer<typeof UsabilityStudyAnalysis>

export const StartUsabilityRun = z
  .object({
    sessionIds: z.array(Id).max(500).optional(),
    again: z.boolean().optional(),
    consent: z.boolean().optional(),
  })
  .meta({ id: 'StartUsabilityRun' })

export const UsabilityRunStarted = z.object({ runId: Id }).meta({ id: 'UsabilityRunStarted' })

export const UsabilityObservation = z
  .object({
    id: Id,
    taskId: z.string().nullable(),
    kind: ObservationKind,
    momentMs: z.number().int(),
    text: z.string(),
    quote: z.string().nullable(),
    seen: z.string().nullable(),
    susItem: z.number().int().nullable(),
    susValue: z.number().int().nullable(),
    screenshot: z.boolean(),
    judge: z.enum(['kept', 'not-confirmed', 'rejected']).nullable(),
    judgeReason: z.string().nullable(),
    arbiter: z.enum(['kept', 'rejected']).nullable(),
    arbiterReason: z.string().nullable(),
    origin: z.enum(['ai', 'person']),
    status: ObservationStatus,
    decidedAt: Timestamp.nullable(),
    version: Version,
  })
  .meta({ id: 'UsabilityObservation' })
export type UsabilityObservation = z.infer<typeof UsabilityObservation>

export const UsabilityTaskResult = z
  .object({
    id: Id,
    outcome: TaskOutcome,
    startMs: z.number().int().nullable(),
    endMs: z.number().int().nullable(),
    timeOnTaskMs: z.number().int().nullable(),
    path: z.string(),
    ease: z.number().int().nullable(),
    status: z.enum(['proposed', 'accepted', 'edited']),
    version: Version,
  })
  .meta({ id: 'UsabilityTaskResult' })

export const UsabilitySessionReview = z
  .object({
    session: z.object({
      id: Id,
      title: z.string(),
      participant: z.string().nullable(),
      facilitators: z.array(z.string()),
    }),
    analysis: z.object({
      state: AnalysisState,
      stage: AnalysisStage.nullable(),
      failure: AnalysisFailureCode.nullable(),
    }),
    protocolVersion: z.number().int(),
    outOfDate: z.boolean(),
    tasks: z.array(
      z.object({
        taskId: z.string(),
        instruction: z.string(),
        criterion: z.string(),
        result: UsabilityTaskResult.nullable(),
        observations: z.array(UsabilityObservation),
      }),
    ),
    rejected: z.array(UsabilityObservation),
    transcript: z
      .object({
        language: z.string().nullable(),
        segments: z.array(
          z.object({
            speaker: z.string(),
            startMs: z.number().int(),
            endMs: z.number().int(),
            text: z.string(),
          }),
        ),
      })
      .nullable(),
    cost: z.number().nullable(),
  })
  .meta({ id: 'UsabilitySessionReview' })
export type UsabilitySessionReview = z.infer<typeof UsabilitySessionReview>

export const ObservationEdit = z.object({
  kind: ObservationKind.optional(),
  // An observation always belongs to a task of the protocol (one without would show nowhere).
  taskId: z.string().max(100).optional(),
  text: z.string().min(1).max(400).optional(),
  momentMs: z.number().int().min(0).optional(),
})

export const DecideObservation = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('accept'), version: Version }),
    z.object({ action: z.literal('reject'), version: Version }),
    z.object({ action: z.literal('reopen'), version: Version }),
    z.object({ action: z.literal('edit'), value: ObservationEdit, version: Version }),
  ])
  .meta({ id: 'DecideObservation' })

export const AddObservation = z
  .object({
    kind: z.enum(['difficulty', 'error', 'positive', 'verbatim', 'assisted']),
    taskId: z.string().max(100),
    momentMs: z.number().int().min(0),
    text: z.string().trim().min(1).max(400),
  })
  .meta({ id: 'AddObservation' })

export const CorrectTaskResult = z
  .object({
    outcome: TaskOutcome,
    timeOnTaskMs: z.number().int().min(0).nullable().optional(),
    version: Version,
  })
  .meta({ id: 'CorrectTaskResult' })

export const UsabilityResults = z
  .object({
    tasks: z.array(
      z.object({
        taskId: z.string(),
        instruction: z.string(),
        sessions: z.number().int(),
        outcomes: z.object({
          success: z.number().int(),
          partial: z.number().int(),
          failure: z.number().int(),
          'not-attempted': z.number().int(),
        }),
        medianMs: z.number().int().nullable(),
        difficulties: z.array(z.object({ text: z.string(), sessions: z.number().int() })),
        ease: z.array(z.number().int()),
      }),
    ),
    sus: z.object({
      mean: z.number().nullable(),
      sessions: z.number().int(),
      perSession: z.array(z.object({ sessionId: Id, score: z.number().nullable() })),
    }),
    toReview: z.number().int(),
  })
  .meta({ id: 'UsabilityResults' })
export type UsabilityResults = z.infer<typeof UsabilityResults>

export const UsabilityRunParams = z.object({ studyId: Id, runId: Id })
export const UsabilitySessionParams = z.object({ sessionId: Id })
export const ObservationParams = z.object({ observationId: Id })
export const TaskResultParams = z.object({ taskResultId: Id })
