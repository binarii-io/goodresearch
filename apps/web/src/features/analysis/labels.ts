import type { Fact, FactsInterview } from '@goodresearch/api-client'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { LEXICON_FAILURES } from '../enrichment/labels.ts'

/** Spec 012: where each validated interview stands in the Analysis phase. */
export const FACTS_STATES: Record<FactsInterview['state'], MessageDescriptor> = {
  'no-transcript': msg`No transcript`,
  'not-clean': msg`Not clean yet`,
  'not-analysed': msg`Not analysed`,
  'to-analyse-again': msg`To analyse again`,
  'to-decide': msg`Facts to decide`,
  done: msg`Done`,
}

export const FACTS_FAILURES: Record<NonNullable<FactsInterview['failure']>, MessageDescriptor> = {
  ...LEXICON_FAILURES,
  NOT_CLEAN: msg`This interview has no validated clean version yet.`,
  INTERRUPTED: msg`The analysis was interrupted: find the facts again.`,
  STOPPED: msg`Taken out of the analysis: find its facts again when you wish.`,
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to find the facts.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: try again.`,
}

/** Where one interview's own reading stands while a "Find facts" runs. */
export const FACTS_READING_STATES: Record<
  NonNullable<FactsInterview['reading']>['state'],
  MessageDescriptor
> = {
  waiting: msg`Waiting`,
  verbatims: msg`Finding verbatims…`,
  facts: msg`Grouping into facts…`,
  done: msg`Analysed`,
  failed: msg`Failed`,
}

export const POLARITIES: Record<Fact['polarity'], MessageDescriptor> = {
  positive: msg`Positive`,
  negative: msg`Negative`,
  neutral: msg`Neutral`,
}

/** The colour of a verbatim: the polarity of its facts not rejected, `mixed` when they differ. */
export type Tone = Fact['polarity'] | 'mixed' | 'none'

export const TONES: Record<Tone, MessageDescriptor> = {
  positive: msg`Positive`,
  negative: msg`Negative`,
  neutral: msg`Neutral`,
  mixed: msg`Mixed`,
  none: msg`No fact`,
}

export const TONE_FILLS: Record<Tone, string> = {
  positive: 'bg-polarity-positive',
  negative: 'bg-polarity-negative',
  neutral: 'bg-polarity-neutral',
  mixed: 'bg-[linear-gradient(135deg,var(--polarity-positive)_50%,var(--polarity-negative)_50%)]',
  none: 'bg-highlight-soft',
}

export const FACT_STATUSES: Record<Fact['status'], MessageDescriptor> = {
  proposed: msg`To decide`,
  accepted: msg`Accepted`,
  edited: msg`Edited`,
  rejected: msg`Rejected`,
}
