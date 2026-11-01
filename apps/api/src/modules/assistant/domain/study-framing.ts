import { weighted } from './guide-progress.ts'
import { type FramingOf, framingUnderWay, pointsLeft } from './project-framing.ts'

/**
 * The three points of a study framing and their weights (spec 021). As for a project, the
 * assistant says how far each point is and the app computes the rest (constitution IV).
 */
export const STUDY_FRAMING_CHECKLIST = [
  ['reuse', 20],
  ['goal', 50],
  ['place', 30],
] as const

export type StudyFramingPoint = (typeof STUDY_FRAMING_CHECKLIST)[number][0]

export type StudyFraming = FramingOf<StudyFramingPoint>

export const studyFramingCompleteness = (
  states: Partial<Record<StudyFramingPoint, string>>,
): StudyFraming => weighted(STUDY_FRAMING_CHECKLIST, states)

/** The framing under way in a conversation: its latest report, unless a study was applied since. */
export const currentStudyFraming = (
  proposals: Parameters<typeof framingUnderWay>[0],
): StudyFraming | null =>
  framingUnderWay(proposals, 'report_study_progress', 'create_study') as StudyFraming | null

/** The points not done yet; all of them without a framing. */
export const openStudyPoints = (framing: StudyFraming | null): StudyFramingPoint[] =>
  pointsLeft(
    framing,
    STUDY_FRAMING_CHECKLIST.map(([key]) => key),
  )
