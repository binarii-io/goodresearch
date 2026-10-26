import type { Person } from './header-rules.ts'
import type { SessionLanguage } from './language.ts'

export type ProposalOrigin =
  | 'file-name'
  | 'header'
  | 'speakers'
  | 'planned'
  | 'ai'
  | 'file-date'
  | 'rule'

export type ProposalStatus = 'proposed' | 'accepted' | 'edited' | 'rejected' | 'already-set'

type Common = {
  readonly origin: ProposalOrigin
  /** Required from the AI, checked in the text sent (FR-005). */
  readonly quote: string | null
  /** Date proposals: a different date found elsewhere, shown to the person. */
  readonly otherDate: string | null
  readonly status: ProposalStatus
}

export type Proposal = Common &
  (
    | { readonly field: 'interviewees' | 'interviewers'; readonly value: readonly Person[] }
    | { readonly field: 'date'; readonly value: string }
    | { readonly field: 'language'; readonly value: SessionLanguage }
    /** The normalised name without the kind of file (the interview's title). */
    | { readonly field: 'name'; readonly value: string }
    | {
        readonly field: 'attachment'
        readonly value: { fileId: string; reason: string; label?: string | null }
      }
  )

export type ProposalField = Proposal['field']

export type AnalysisFailure =
  | 'UNREADABLE_FORMAT'
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  /** Drive did not answer (network, outage): try again later. */
  | 'DRIVE_UNAVAILABLE'
  /** The file is a summary, not a transcript (no speaker turns): the app excludes it. */
  | 'NOT_A_TRANSCRIPT'
  /** Left waiting or analyzing by a run that is no longer going (stopped worker). */
  | 'INTERRUPTED'
  | 'AI_PROVIDER_REQUIRED'
  | 'AI_FAILED'
  | 'INVALID_ANSWER'

/** The last analysis of a session (spec 009), part of the Session aggregate (research R1). */
export type Analysis = {
  readonly state: 'waiting' | 'analyzing' | 'done' | 'failed'
  /** Why the AI part failed; the app's proposals are kept. */
  readonly failure: AnalysisFailure | null
  readonly runId: string | null
  readonly by: string
  readonly at: Date | null
  /** The files as they were read: a later change shows "files changed since". */
  readonly filesRead: readonly {
    readonly fileId: string
    readonly name: string
    readonly modifiedAt: string | null
  }[]
  readonly usedAi: boolean
  readonly proposals: readonly Proposal[]
}
