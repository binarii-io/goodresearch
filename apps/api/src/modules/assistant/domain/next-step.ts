/**
 * What comes next on an interview study (spec 023), from its state; computed, never by the model.
 * Planning interviews is up to the person and blocks nothing (spec 024).
 */
export type NextStep =
  | 'write-guide'
  | 'add-folder'
  | 'publish'
  | 'fieldwork'
  | 'analyse'
  | 'decide'
  | 'validate'
  | 'next-phase'

export const nextStep = (s: {
  hasGuide: boolean
  hasFolder: boolean
  published: readonly string[]
  /** Spec 025: where the interviews stand, read only once the preparation is done. */
  interviews?: 'none' | 'analyse' | 'decide' | 'validate' | 'done' | undefined
}): NextStep => {
  if (!s.hasGuide) return 'write-guide'
  if (!s.hasFolder) return 'add-folder'
  if (!s.published.includes('guide') || !s.published.includes('best-practices')) return 'publish'
  if (s.interviews === 'done') return 'next-phase'
  if (!s.interviews || s.interviews === 'none') return 'fieldwork'
  return s.interviews
}
