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

export type QuestionnaireSectionKind = 'introduction' | 'profiling' | 'theme' | 'closing'

export const QUESTIONNAIRE_SECTION_KINDS: Record<QuestionnaireSectionKind, MessageDescriptor> = {
  introduction: msg`Introduction`,
  profiling: msg`Profiling`,
  theme: msg`Theme`,
  closing: msg`Closing`,
}

export type ItemKind = 'likert' | 'single-choice' | 'multiple-choice' | 'open'

export const ITEM_KINDS: Record<ItemKind, MessageDescriptor> = {
  likert: msg`Likert scale`,
  'single-choice': msg`Single choice`,
  'multiple-choice': msg`Multiple choice`,
  open: msg`Open question`,
}

/** What each kind of item allows at the analysis (spec 027 FR-009). */
export const ITEM_ANALYSIS: Record<ItemKind, MessageDescriptor> = {
  likert: msg`Allows a distribution and a median, read as ordered and not as a measure.`,
  'single-choice': msg`Allows counts, shares and crossing with the profiling items.`,
  'multiple-choice': msg`Allows counts, shares and crossing with the profiling items.`,
  open: msg`Allows a reading by theme, with a person's validation.`,
}

export const ITEM_MEASURES: Record<'factual' | 'subjective', MessageDescriptor> = {
  factual: msg`A fact`,
  subjective: msg`A perception`,
}

export const RECRUITMENTS: Record<'targeted' | 'wide-then-filter', MessageDescriptor> = {
  targeted: msg`Sent to people matching the target`,
  'wide-then-filter': msg`Sent widely, then filtered`,
}

/** The eight points of a questionnaire design (spec 027 US2). */
export const QUESTIONNAIRE_POINTS: Record<string, MessageDescriptor> = {
  objectiveThemes: msg`Objective and themes`,
  hypotheses: msg`Hypotheses`,
  audience: msg`Target audience and recruitment`,
  administration: msg`Administration and consent`,
  profiling: msg`Profiling items`,
  thematicItems: msg`Thematic items`,
  formatOrder: msg`Format and order`,
  biasReview: msg`Bias review`,
}

/** What the writing rules flag in an item (spec 027 FR-007). */
export const ITEM_FLAGS: Record<string, MessageDescriptor> = {
  double: msg`two ideas in one item`,
  negation: msg`a negation`,
  leading: msg`suggests the answer`,
  absolute: msg`an absolute word`,
  'too-long': msg`too long`,
  'factual-on-likert': msg`a fact asked on a scale: prefer a choice`,
  identifying: msg`asks for directly identifying data`,
}

export const QUESTIONNAIRE_FLAGS: Record<string, MessageDescriptor> = {
  'legends-differ': msg`The scales do not all share one legend.`,
  'closed-series': msg`More than 10 closed items in a row: an open question would break the series.`,
  'no-profiling': msg`No profiling item to check the target audience.`,
  'too-many-open': msg`Many open questions: they are harder to interpret.`,
}
