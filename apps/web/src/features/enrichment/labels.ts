import type {
  CleaningInterview,
  Correction,
  EnrichmentInterview,
  LexiconTerm,
} from '@goodresearch/api-client'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** Spec 010: where each validated interview stands in the Enrichment phase. */
export const ENRICHMENT_STATES: Record<EnrichmentInterview['state'], MessageDescriptor> = {
  'no-transcript': msg`No transcript`,
  'not-read': msg`Not read`,
  changed: msg`Changed since`,
  'to-decide': msg`Terms to decide`,
  read: msg`Read`,
}

export const READING_STATES: Record<
  NonNullable<EnrichmentInterview['reading']>,
  MessageDescriptor
> = {
  waiting: msg`Waiting`,
  reading: msg`Importing…`,
  // After its import, the tab says where the interview's words are (preparing, finding, counting).
  done: msg`Imported`,
  failed: msg`Failed`,
}

export const LEXICON_FAILURES: Record<
  NonNullable<EnrichmentInterview['failure']>,
  MessageDescriptor
> = {
  FILE_NOT_FOUND: msg`The transcript is no longer in Drive, or you cannot open it.`,
  DRIVE_NOT_CONNECTED: msg`Connect Google Drive to read the transcript.`,
  DRIVE_UNAVAILABLE: msg`Google Drive did not answer (network or outage): try again.`,
  UNREADABLE_FORMAT: msg`The app cannot read this file format.`,
  TOO_LONG: msg`This transcript is too long to be read (more than 400,000 characters).`,
  NO_TRANSCRIPT: msg`This interview has no transcript.`,
  INTERRUPTED: msg`The reading was interrupted: find the terms again.`,
  STOPPED: msg`Taken out of the reading: find its terms again when you wish.`,
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to find the terms.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: some terms may be missing, try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: some terms may be missing, try again.`,
}

export const TERM_KINDS: Record<LexiconTerm['kind'], MessageDescriptor> = {
  domain: msg`Term`,
  suspect: msg`Transcription error`,
}

export const TERM_CATEGORIES: Record<LexiconTerm['category'], MessageDescriptor> = {
  product: msg`Product`,
  organisation: msg`Organisation`,
  place: msg`Place`,
  acronym: msg`Acronym`,
  jargon: msg`Jargon`,
  role: msg`Role`,
  person: msg`Person`,
  other: msg`Other`,
}

export const TERM_STATUSES: Record<LexiconTerm['status'], MessageDescriptor> = {
  proposed: msg`To decide`,
  accepted: msg`Accepted`,
  edited: msg`Edited`,
  rejected: msg`Rejected`,
  merged: msg`Merged`,
}

export const LANGUAGES: Record<LexiconTerm['language'], MessageDescriptor> = {
  en: msg`English`,
  fr: msg`French`,
  other: msg`Other language`,
}

export const TERM_SCOPES: Record<LexiconTerm['scope'], MessageDescriptor> = {
  global: msg`Everywhere`,
  'case-by-case': msg`Case by case`,
}

/** Spec 011: where each validated interview stands in Cleaning. */
export const CLEANING_STATES: Record<CleaningInterview['state'], MessageDescriptor> = {
  'no-transcript': msg`No transcript`,
  'not-cleaned': msg`Not cleaned`,
  'to-redo': msg`To clean again`,
  'to-decide': msg`Corrections to decide`,
  'lexicon-changed': msg`Lexicon changed`,
  clean: msg`Clean version validated`,
  published: msg`Published`,
  'out-of-date': msg`Out of date in Drive`,
}

export const CLEANING_FAILURES: Record<
  NonNullable<CleaningInterview['failure']>,
  MessageDescriptor
> = {
  ...LEXICON_FAILURES,
  INTERRUPTED: msg`The cleaning was interrupted: clean the transcripts again.`,
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to clean with the AI.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: some corrections may be missing, try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: some corrections may be missing, try again.`,
}

export const CORRECTION_SOURCES: Record<Correction['source'], MessageDescriptor> = {
  person: msg`Yours`,
  lexicon: msg`Lexicon`,
  name: msg`Name`,
  'ai-lexicon': msg`AI, from the lexicon`,
  'ai-other': msg`AI`,
}

export const CORRECTION_KINDS: Record<Correction['kind'], MessageDescriptor> = {
  term: msg`Term`,
  transcription: msg`Transcription error`,
  speaker: msg`Speaker`,
  name: msg`Name`,
}

/** A correction (feminine in French): its own words, not the terms'. */
export const CORRECTION_STATUSES: Record<Correction['status'], MessageDescriptor> = {
  proposed: msg`To decide`,
  accepted: msg({ message: 'Accepted', context: 'feminine' }),
  edited: msg({ message: 'Edited', context: 'feminine' }),
  rejected: msg({ message: 'Rejected', context: 'feminine' }),
}

export const CONFIDENCES: Record<NonNullable<Correction['confidence']>, MessageDescriptor> = {
  high: msg`High confidence`,
  medium: msg`Medium confidence`,
  low: msg`Low confidence`,
}
