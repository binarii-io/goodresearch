import type { Session, SessionProposal } from '@goodresearch/api-client'
import type { I18n, MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

export const SESSION_STATES: Record<Session['state'], MessageDescriptor> = {
  proposed: msg`Proposed`,
  validated: msg`Validated`,
  excluded: msg`Excluded`,
}

const CONFIDENCES: Record<'high' | 'medium' | 'low', MessageDescriptor> = {
  high: msg`high confidence`,
  medium: msg`medium confidence`,
  low: msg`low confidence`,
}

export const SUGGESTION_RULES: Record<'transcript' | 'name' | 'date', MessageDescriptor> = {
  transcript: msg`name found in the transcript`,
  name: msg`name in the file name`,
  date: msg`same date`,
}

/** Why a recording goes with a transcript, as people read it (research R3). */
export const matchReason = (
  i18n: I18n,
  m: { confidence: 'high' | 'medium' | 'low' | null; reason: string },
): string => {
  if (m.reason === 'alone') return i18n._(msg`no transcript found for it`)
  if (m.confidence === null) return i18n._(msg`added by hand`)
  const word = m.reason.startsWith('shared-word:') ? m.reason.slice('shared-word:'.length) : null
  const why =
    m.reason === 'same-time'
      ? i18n._(msg`same time`)
      : m.reason === 'same-meeting'
        ? i18n._(msg`same meeting in their names`)
        : m.reason === 'close-time'
          ? i18n._(msg`within 15 minutes`)
          : i18n._(msg`shared word “${word ?? ''}”`)
  return `${i18n._(CONFIDENCES[m.confidence])}, ${why}`
}

type Analysis = NonNullable<Session['analysis']>

/** Spec 009: what each proposal is about. */
export const PROPOSAL_FIELDS: Record<SessionProposal['field'], MessageDescriptor> = {
  interviewees: msg`Interviewed`,
  interviewers: msg`Interviewers`,
  date: msg`Date of the interview`,
  language: msg`Language`,
  name: msg`Name of the files`,
  attachment: msg`Belongs to the interview`,
}

/** Where a proposal comes from: the person sees it before deciding. */
export const PROPOSAL_ORIGINS: Record<SessionProposal['origin'], MessageDescriptor> = {
  'file-name': msg`from the file name`,
  header: msg`from the header of the transcript`,
  speakers: msg`from the speakers of the transcript`,
  planned: msg`from the planned interview`,
  ai: msg`found by the AI`,
  'file-date': msg`date of the file in Drive`,
  rule: msg`built by the app`,
}

export const PROPOSAL_STATUSES: Record<SessionProposal['status'], MessageDescriptor> = {
  proposed: msg`To decide`,
  accepted: msg`Accepted`,
  edited: msg`Changed`,
  rejected: msg`Rejected`,
  'already-set': msg`Already set`,
}

export const LANGUAGES: Record<'en' | 'fr' | 'other', MessageDescriptor> = {
  en: msg`English`,
  fr: msg`French`,
  other: msg`Other language`,
}

export const ANALYSIS_STATES: Record<Analysis['state'], MessageDescriptor> = {
  waiting: msg`Waiting for analysis`,
  analyzing: msg`Analyzing…`,
  done: msg`Analyzed`,
  failed: msg`Analysis incomplete`,
}

export const ANALYSIS_FAILURES: Record<NonNullable<Analysis['failure']>, MessageDescriptor> = {
  UNREADABLE_FORMAT: msg`The app cannot read this file format: only the file names were used.`,
  FILE_NOT_FOUND: msg`The transcript is no longer in Drive, or you cannot open it.`,
  DRIVE_NOT_CONNECTED: msg`Connect Google Drive to read the transcript.`,
  DRIVE_UNAVAILABLE: msg`Google Drive did not answer (network or outage): try again.`,
  INTERRUPTED: msg`The analysis was interrupted: analyze again.`,
  NOT_A_TRANSCRIPT: msg`This file is a summary, not a transcript: the app excluded it. Reopen it if it is an interview.`,
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to find what the app's rules did not.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: try again.`,
}

/** Reasons of exclusions made by the app, as people read them (others are the person's text). */
export const excludedReason = (i18n: I18n, reason: string): string =>
  reason === 'not-a-transcript' ? i18n._(msg`a summary, not a transcript (by the app)`) : reason
