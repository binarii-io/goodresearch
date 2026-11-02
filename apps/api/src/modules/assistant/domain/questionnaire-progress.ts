import { weighted } from './guide-progress.ts'

/**
 * The eight points of a questionnaire design and their weights (spec 027 US2). The assistant only
 * says how far each point is; the app computes the percentage (constitution IV).
 */
export const QUESTIONNAIRE_CHECKLIST = [
  ['objectiveThemes', 20],
  ['hypotheses', 5],
  ['audience', 15],
  ['administration', 10],
  ['profiling', 10],
  ['thematicItems', 25],
  ['formatOrder', 10],
  ['biasReview', 5],
] as const

export type QuestionnairePoint = (typeof QUESTIONNAIRE_CHECKLIST)[number][0]

export const questionnaireCompleteness = (states: Partial<Record<QuestionnairePoint, string>>) =>
  weighted(QUESTIONNAIRE_CHECKLIST, states)
