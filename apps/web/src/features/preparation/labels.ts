import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'

export type SectionKind = 'introduction' | 'warm-up' | 'theme' | 'wrap-up'

export const SECTION_KINDS: Record<SectionKind, MessageDescriptor> = {
  introduction: msg`Introduction`,
  'warm-up': msg`Warm-up questions`,
  theme: msg`Theme`,
  'wrap-up': msg`Wrap-up`,
}

export type PlannedStatus =
  | 'to-contact'
  | 'invited'
  | 'scheduled'
  | 'done'
  | 'postponed'
  | 'cancelled'

export const PLANNED_STATUSES: Record<PlannedStatus, MessageDescriptor> = {
  'to-contact': msg`To contact`,
  invited: msg`Invited`,
  scheduled: msg`Scheduled`,
  done: msg`Done`,
  postponed: msg`Postponed`,
  cancelled: msg`Cancelled`,
}

/** The eight points of a guide design (spec 006 US1). */
export const GUIDE_POINTS: Record<string, MessageDescriptor> = {
  objectives: msg`Objectives and themes`,
  hypotheses: msg`Hypotheses`,
  audience: msg`Audience and recruitment`,
  format: msg`Format and logistics`,
  intro: msg`Introduction and warm-up`,
  themes: msg`Thematic questions`,
  followUps: msg`Follow-ups`,
  biasReview: msg`Bias review`,
}

export const POINT_STATES: Record<'missing' | 'partial' | 'done', MessageDescriptor> = {
  missing: msg`missing`,
  partial: msg`partial`,
  done: msg`covered`,
}

/** What the writing rules flag in a question. */
export const QUESTION_ISSUES: Record<string, MessageDescriptor> = {
  closed: msg`closed (yes or no)`,
  leading: msg`suggests the answer`,
  hypothetical: msg`hypothetical`,
  future: msg`about the future`,
  solution: msg`asks for a solution`,
  double: msg`two questions in one`,
  long: msg`too long`,
}
