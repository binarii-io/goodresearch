import type { InsightCard, InsightLink, InsightRunView } from '@goodresearch/api-client'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

/** Spec 013: an insight's status, confidence and polarity, always as text (FR-019). */
export const INSIGHT_STATUSES: Record<InsightCard['status'], MessageDescriptor> = {
  proposed: msg`To decide`,
  validated: msg`Validated`,
  edited: msg`Edited`,
  rejected: msg`Rejected`,
}

export const CONFIDENCES: Record<InsightCard['confidence']['level'], MessageDescriptor> = {
  high: msg`High confidence`,
  medium: msg`Medium confidence`,
  low: msg`Low confidence`,
}

/** The level alone, inside a sentence. */
export const CONFIDENCE_LEVELS: Record<InsightCard['confidence']['level'], MessageDescriptor> = {
  high: msg`high`,
  medium: msg`medium`,
  low: msg`low`,
}

export const INSIGHT_POLARITIES: Record<InsightCard['polarity'], MessageDescriptor> = {
  positive: msg`Positive`,
  negative: msg`Negative`,
  neutral: msg`Neutral`,
  mixed: msg`Mixed`,
}

export const POLARITY_FILLS: Record<InsightCard['polarity'], string> = {
  positive: 'bg-polarity-positive',
  negative: 'bg-polarity-negative',
  neutral: 'bg-polarity-neutral',
  mixed: 'bg-[linear-gradient(135deg,var(--polarity-positive)_50%,var(--polarity-negative)_50%)]',
}

/** The linked fact now (research R7). */
export const LINKED_FACTS: Record<InsightLink['fact'], MessageDescriptor> = {
  accepted: msg`Accepted`,
  'to-decide': msg`To validate`,
  changed: msg`Changed since`,
  'not-accepted': msg`No longer accepted`,
  deleted: msg`Deleted`,
  outside: msg`Outside the project`,
}

export const INSIGHT_FAILURES: Record<NonNullable<InsightRunView['failure']>, MessageDescriptor> = {
  AI_PROVIDER_REQUIRED: msg`Set up your AI provider to find insights.`,
  AI_FAILED: msg`The AI provider returned an error or took too long: try again.`,
  INVALID_ANSWER: msg`The AI answer could not be used: try again.`,
  INTERRUPTED: msg`The run was interrupted: find insights again.`,
  NO_FACTS: msg`No accepted fact to read.`,
  NO_INSIGHTS: msg`No insight to read: they were rejected or changed meanwhile.`,
}

/** Spec 014: a recommendation's kind, impact and effort, and its insights now, always as text. */
export const REC_KINDS: Record<'build' | 'test' | 'investigate', MessageDescriptor> = {
  build: msg`Build`,
  test: msg`Test`,
  investigate: msg`Investigate`,
}

export const RATINGS: Record<'high' | 'medium' | 'low', MessageDescriptor> = {
  high: msg`High`,
  medium: msg`Medium`,
  low: msg`Low`,
}

export const LINKED_INSIGHTS: Record<
  'validated' | 'to-decide' | 'rejected' | 'deleted' | 'changed',
  MessageDescriptor
> = {
  validated: msg`Validated`,
  'to-decide': msg`To validate`,
  rejected: msg`Rejected`,
  deleted: msg`Deleted`,
  changed: msg`Changed since`,
}
