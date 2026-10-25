import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'
import { PlannedInterviewStatus } from './preparation.ts'

/** Spec 008: the interviews (sessions) found in a study's folder, in the Fieldwork phase. */
export const SessionState = z.enum(['proposed', 'validated', 'excluded'])
export const MatchConfidence = z.enum(['high', 'medium', 'low'])
export const RosterRole = z.enum(['interviewer', 'interviewee'])

export const RosterEntry = z
  .object({
    id: z.string(),
    name: z.string(),
    role: RosterRole,
    memberId: z.string().nullable(),
  })
  .meta({ id: 'RosterEntry' })

const RosterEntryInput = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(120),
  role: RosterRole,
  memberId: z.string().max(64).nullable().optional(),
})

const SessionFile = z.object({
  fileId: z.string(),
  name: z.string(),
  /** Tells a video from an audio recording. */
  mimeType: z.string(),
  group: z.string(),
  modifiedAt: Timestamp.nullable(),
  webLink: z.string(),
})

const LinkedPlanned = z.object({
  plannedInterviewId: Id,
  interviewee: z.string(),
  interviewers: z.string(),
  scheduledAt: Timestamp.nullable(),
  status: PlannedInterviewStatus,
  version: Version,
})

export const Session = z
  .object({
    id: Id,
    state: SessionState,
    title: z.string().nullable(),
    /** The linked interviewee, else the transcript's name. */
    defaultTitle: z.string(),
    /** `null` without transcript (`noTranscript`) or when the file left the folder (`fileMissing`). */
    transcript: SessionFile.nullable(),
    /** A recording found without its transcript: shown with a warning. */
    noTranscript: z.boolean(),
    fileMissing: z.boolean(),
    media: z.array(
      SessionFile.extend({
        /** `null`: chosen by a person. */
        confidence: MatchConfidence.nullable(),
        /** `same-time`, `close-time`, `shared-word:<word>`, `person` or `alone`. */
        reason: z.string(),
      }),
    ),
    mediaEdited: z.boolean(),
    link: LinkedPlanned.extend({ linkedBy: z.enum(['suggestion', 'person']) }).nullable(),
    suggestion: LinkedPlanned.extend({ rule: z.enum(['name', 'date']) }).nullable(),
    roster: z.array(RosterEntry),
    excludedReason: z.string().nullable(),
    decidedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    decidedAt: Timestamp.nullable(),
    version: Version,
  })
  .meta({ id: 'Session' })
export type Session = z.infer<typeof Session>

export const Fieldwork = z
  .object({
    sessions: z.array(Session),
    /** Recordings a person can add to an interview: free ones and those alone in their own row. */
    unmatchedMedia: z.array(SessionFile),
    plannedWithoutSession: z.array(
      z.object({
        id: Id,
        interviewee: z.string(),
        scheduledAt: Timestamp.nullable(),
        status: PlannedInterviewStatus,
      }),
    ),
    totals: z.object({
      proposed: z.number().int(),
      validated: z.number().int(),
      excluded: z.number().int(),
    }),
    /** Transcripts beyond the limit of 500 sessions per study. */
    skipped: z.number().int(),
  })
  .meta({ id: 'Fieldwork' })
export type Fieldwork = z.infer<typeof Fieldwork>

export const SessionParams = z.object({ sessionId: Id })

export const LinkSession = z
  .object({
    plannedInterviewId: Id.nullable(),
    version: Version,
    /** Take the planned interview from the session that holds it. */
    move: z.boolean().optional(),
    /** Confirming the app's suggestion, or a person's own pick. */
    confirmSuggestion: z.boolean().optional(),
  })
  .meta({ id: 'LinkSession' })

export const EditSession = z
  .object({
    version: Version,
    title: z.string().max(120).nullable().optional(),
    media: z.array(z.string().max(200)).max(50).optional(),
    roster: z.array(RosterEntryInput).max(10).optional(),
  })
  .meta({ id: 'EditSession' })

export const DecideSession = z
  .object({
    decision: z.enum(['validate', 'exclude', 'reopen']),
    reason: z.string().max(500).optional(),
    version: Version,
  })
  .meta({ id: 'DecideSession' })
