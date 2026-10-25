/**
 * The eight points of an interview guide design and their weights (spec 006 research R3). The
 * assistant only says how far each point is; the app computes the percentage (constitution IV).
 */
export const GUIDE_CHECKLIST = [
  ['objectives', 15],
  ['hypotheses', 10],
  ['audience', 15],
  ['format', 10],
  ['intro', 10],
  ['themes', 25],
  ['followUps', 10],
  ['biasReview', 5],
] as const

export type GuidePoint = (typeof GUIDE_CHECKLIST)[number][0]
export const GUIDE_POINT_STATES = ['missing', 'partial', 'done'] as const
export type GuidePointState = (typeof GUIDE_POINT_STATES)[number]

const VALUE: Record<GuidePointState, number> = { missing: 0, partial: 0.5, done: 1 }

export const completeness = (states: Partial<Record<GuidePoint, string>>) => {
  const items = GUIDE_CHECKLIST.map(([key, weight]) => {
    const state = states[key]
    const status: GuidePointState = GUIDE_POINT_STATES.includes(state as GuidePointState)
      ? (state as GuidePointState)
      : 'missing'
    return { key, weight, status }
  })
  return {
    percent: Math.round(items.reduce((sum, i) => sum + i.weight * VALUE[i.status], 0)),
    items,
  }
}
