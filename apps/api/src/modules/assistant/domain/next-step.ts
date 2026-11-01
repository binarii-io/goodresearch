/** What comes next on an interview study (spec 023), from its state; computed, never by the model. */
export type NextStep = 'write-guide' | 'add-folder' | 'publish' | 'plan-interviews' | 'fieldwork'

export const nextStep = (s: {
  hasGuide: boolean
  hasFolder: boolean
  published: readonly string[]
  planned: number
}): NextStep => {
  if (!s.hasGuide) return 'write-guide'
  if (!s.hasFolder) return 'add-folder'
  if (!s.published.includes('guide') || !s.published.includes('best-practices')) return 'publish'
  return s.planned === 0 ? 'plan-interviews' : 'fieldwork'
}

/** Interviews still to run or done; a cancelled one is not planned. */
export const plannedCount = (schedule: Readonly<Partial<Record<string, number>>>): number =>
  Object.entries(schedule)
    .filter(([status]) => status !== 'cancelled')
    .reduce((sum, [, n]) => sum + (n ?? 0), 0)
