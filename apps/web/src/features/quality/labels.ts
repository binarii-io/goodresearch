import type { QualityInterviewRow, QualityRemark } from '@goodresearch/api-client'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { LEXICON_FAILURES } from '../enrichment/labels.ts'

/** Spec 016: where each validated interview stands in the Quality tab. */
export const EVALUATION_STATES: Record<QualityInterviewRow['state'], MessageDescriptor> = {
  'no-transcript': msg`No transcript`,
  'not-clean': msg`Not clean yet`,
  'speakers-not-identified': msg`Speakers not identified`,
  'not-measurable': msg`Not measurable`,
  'not-reviewed': msg`Not reviewed`,
  reviewing: msg`Reviewing`,
  'to-review-again': msg`To review again`,
  reviewed: msg({ message: 'Reviewed', context: 'interview quality' }),
}

export const QUALITY_FAILURES: Record<
  NonNullable<QualityInterviewRow['failure']>,
  MessageDescriptor
> = {
  ...LEXICON_FAILURES,
  NOT_CLEAN: msg`This interview has no validated clean version yet.`,
  INTERRUPTED: msg`The review was interrupted: review the interviews again.`,
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to review the interviews.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: try again.`,
}

/** Why an interview shows no figure: said with its state, never a false figure. */
export const EVALUATION_REASONS: Partial<Record<QualityInterviewRow['state'], MessageDescriptor>> =
  {
    'not-measurable': msg`The transcript gives nearly every word to the interviewer, so it probably does not tell the voices apart (one microphone, or labels inside the text). Figures and remarks would be wrong.`,
    'speakers-not-identified': msg`Too many words belong to no known person, so the shares would be false. Say who speaks in the interview.`,
    'not-clean': msg`This interview has no validated clean version yet.`,
  }

export const REMARK_KINDS: Record<QualityRemark['kind'], MessageDescriptor> = {
  'leading-question': msg`Leading question`,
  'reformulation-with-opinion': msg`Reformulation with opinion`,
  opinion: msg`Opinion or suggestion`,
}

export const REVIEW_ACTIONS: Record<
  NonNullable<QualityInterviewRow['action']>,
  MessageDescriptor
> = {
  review: msg({ message: 'Review', context: 'interview quality' }),
  'review-again': msg`Review again`,
  'review-anyway': msg`Review anyway`,
}
