import { weighted } from './guide-progress.ts'

/**
 * The nine points of a test protocol design and their weights (spec 036 US2). The assistant only
 * says how far each point is; the app computes the percentage (constitution IV).
 */
export const PROTOCOL_CHECKLIST = [
  ['objectiveHypotheses', 15],
  ['interface', 10],
  ['participants', 10],
  ['formatConsent', 10],
  ['scenario', 10],
  ['tasks', 25],
  ['criteria', 10],
  ['questionnaireDebrief', 5],
  ['biasReview', 5],
] as const

export type ProtocolPoint = (typeof PROTOCOL_CHECKLIST)[number][0]

export const protocolCompleteness = (states: Partial<Record<ProtocolPoint, string>>) =>
  weighted(PROTOCOL_CHECKLIST, states)
