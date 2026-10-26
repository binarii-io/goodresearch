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

/** Spec 009: what an analysis proposes, where it comes from, and what the person decided. */
export const ProposalField = z.enum([
  'interviewees',
  'interviewers',
  'date',
  'language',
  'name',
  'attachment',
])
export const ProposalOrigin = z.enum([
  'file-name',
  'header',
  'speakers',
  'planned',
  'ai',
  'file-date',
  'rule',
])
export const ProposalStatus = z.enum(['proposed', 'accepted', 'edited', 'rejected', 'already-set'])
export const SessionLanguage = z.enum(['en', 'fr', 'other'])

const ProposedPerson = z.object({
  name: z.string().trim().min(1).max(120),
  memberId: z.string().max(64).nullable(),
})

export const SessionProposal = z
  .object({
    field: ProposalField,
    /** People, a date (`YYYY-MM-DD`), a language, a name, or an attachment. */
    people: z.array(ProposedPerson).nullable(),
    text: z.string().nullable(),
    attachment: SessionFile.extend({ reason: z.string() }).nullable(),
    origin: ProposalOrigin,
    quote: z.string().nullable(),
    otherDate: z.string().nullable(),
    status: ProposalStatus,
  })
  .meta({ id: 'SessionProposal' })
export type SessionProposal = z.infer<typeof SessionProposal>

export const AnalysisFailure = z.enum([
  'UNREADABLE_FORMAT',
  'FILE_NOT_FOUND',
  'DRIVE_NOT_CONNECTED',
  'DRIVE_UNAVAILABLE',
  'NOT_A_TRANSCRIPT',
  'INTERRUPTED',
  'AI_PROVIDER_REQUIRED',
  'AI_FAILED',
  'INVALID_ANSWER',
])

export const SessionAnalysis = z
  .object({
    state: z.enum(['waiting', 'analyzing', 'done', 'failed']),
    failure: AnalysisFailure.nullable(),
    at: Timestamp.nullable(),
    by: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    usedAi: z.boolean(),
    /** The files changed in the folder since they were read. */
    filesChanged: z.boolean(),
    proposals: z.array(SessionProposal),
  })
  .meta({ id: 'SessionAnalysis' })

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
    suggestion: LinkedPlanned.extend({ rule: z.enum(['transcript', 'name', 'date']) }).nullable(),
    roster: z.array(RosterEntry),
    excludedReason: z.string().nullable(),
    decidedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    decidedAt: Timestamp.nullable(),
    interviewDate: z.string().nullable(),
    language: SessionLanguage.nullable(),
    attachments: z.array(SessionFile),
    analysis: SessionAnalysis.nullable(),
    /** USD spent analyzing this interview, by anyone; `null` when a price is unknown. */
    cost: z.number().nullable(),
    /** The files in Drive carry the accepted name (last inventory); null before one is accepted. */
    fileNames: z.object({ inSync: z.boolean(), differing: z.number().int() }).nullable(),
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
    /** USD spent analyzing the study's interviews, by anyone. */
    analysisCost: z.number().nullable(),
    run: z
      .object({
        id: Id,
        state: z.enum(['running', 'stopped', 'done']),
        stopRequested: z.boolean(),
        total: z.number().int(),
        done: z.number().int(),
        failed: z.number().int(),
        startedBy: z.object({ id: z.string(), name: z.string().nullable() }),
      })
      .nullable(),
    anonymised: z.boolean(),
    /** Interviews whose file names hold an interviewee's name (to rename under anonymisation). */
    namedFiles: z.number().int(),
    /** The person has not yet agreed to send transcripts to their current AI provider. */
    consentNeeded: z.boolean(),
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

export const AnalyzeSession = z
  .object({ consent: z.boolean().optional() })
  .meta({ id: 'AnalyzeSession' })

export const StartAnalysisRun = z
  .object({
    consent: z.boolean().optional(),
    /** Analyze again the interviews already analyzed (their decided proposals are kept). */
    all: z.boolean().optional(),
  })
  .meta({ id: 'StartAnalysisRun' })

export const AnalysisEstimate = z
  .object({
    /** Interviews the run covers. */
    count: z.number().int(),
    withTranscript: z.number().int(),
    /** The most it can cost (every interview with a transcript calls the AI); null without a price. */
    estimatedCost: z.number().nullable(),
    consentNeeded: z.boolean(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'AnalysisEstimate' })

export const EstimateQuery = z.object({ all: z.enum(['true', 'false']).optional() })

export const AnalysisRunStarted = z.object({ runId: Id }).meta({ id: 'AnalysisRunStarted' })

export const RunParams = z.object({ studyId: Id, runId: Id })

export const DecideProposals = z
  .object({
    version: Version,
    decisions: z
      .array(
        z.object({
          field: ProposalField,
          fileId: z.string().max(200).optional(),
          action: z.enum(['accept', 'edit', 'reject']),
          /** For `edit`: people for interviewees/interviewers, else a text. */
          people: z.array(ProposedPerson).max(10).optional(),
          text: z.string().trim().max(120).optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .meta({ id: 'DecideProposals' })

export const RenamePlan = z
  .object({
    files: z.array(
      z.object({
        fileId: z.string(),
        kind: z.enum(['transcript', 'media', 'attachment']),
        current: z.string(),
        next: z.string(),
        canEdit: z.boolean(),
      }),
    ),
    /** The person granted Drive editing (spec 007). */
    writeAccess: z.boolean(),
  })
  .meta({ id: 'RenamePlan' })

export const RenameFiles = z
  .object({ fileIds: z.array(z.string().max(200)).min(1).max(50) })
  .meta({ id: 'RenameFiles' })

export const RenameResult = z
  .object({
    results: z.array(
      z.object({
        fileId: z.string(),
        outcome: z.enum(['renamed', 'cannot-edit', 'not-found', 'failed']),
        /** The name the file has now. */
        name: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'RenameResult' })
