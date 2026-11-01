import { type GuidePointState, weighted } from './guide-progress.ts'

/**
 * The five points of a project framing and their weights (spec 018). As for the guide, the
 * assistant says how far each point is and the app computes the rest (constitution IV).
 */
export const FRAMING_CHECKLIST = [
  ['question', 30],
  ['audience', 20],
  ['decision', 25],
  ['hypotheses', 15],
  ['team', 10],
] as const

export type FramingPoint = (typeof FRAMING_CHECKLIST)[number][0]

export type FramingOf<Point extends string> = {
  percent: number
  items: { key: Point; weight: number; status: GuidePointState }[]
}

export type Framing = FramingOf<FramingPoint>

export const framingCompleteness = (states: Partial<Record<FramingPoint, string>>): Framing =>
  weighted(FRAMING_CHECKLIST, states)

type ProposalFacts = {
  kind: string
  state: string
  decidedAt: Date | null
  preview: { progress?: { percent: number; items: readonly { key: string }[] } }
}

const timeOf = (p: ProposalFacts) => p.decidedAt?.getTime() ?? 0

/**
 * The framing under way in a conversation: its latest report, unless its object was applied since,
 * which ends it. Compared by time: proposals have no order, and a card applied late ends the
 * reports made while it was open.
 */
export const framingUnderWay = (
  proposals: readonly ProposalFacts[],
  report: string,
  created: string,
): FramingOf<string> | null => {
  const latest = proposals
    .filter((p) => p.kind === report && p.state === 'applied')
    .reduce<ProposalFacts | null>((a, p) => (!a || timeOf(p) >= timeOf(a) ? p : a), null)
  if (!latest) return null
  const ended = proposals.some(
    (p) => p.kind === created && p.state === 'applied' && timeOf(p) >= timeOf(latest),
  )
  return ended ? null : ((latest.preview.progress as FramingOf<string> | undefined) ?? null)
}

export const currentFraming = (proposals: readonly ProposalFacts[]): Framing | null =>
  framingUnderWay(proposals, 'report_project_progress', 'create_project') as Framing | null

/** The points not done yet; all of them without a framing. */
export const pointsLeft = <Point extends string>(
  framing: FramingOf<Point> | null,
  all: readonly Point[],
): Point[] =>
  framing ? framing.items.filter((i) => i.status !== 'done').map((i) => i.key) : [...all]

export const openPoints = (framing: Framing | null): FramingPoint[] =>
  pointsLeft(
    framing,
    FRAMING_CHECKLIST.map(([key]) => key),
  )

const HEADINGS = {
  en: {
    question: 'Research question',
    objectives: 'Objectives',
    hypotheses: 'Hypotheses',
    none: 'None yet',
  },
  fr: {
    question: 'Question de recherche',
    objectives: 'Objectifs',
    hypotheses: 'Hypothèses',
    none: 'Aucune pour l’instant',
  },
} as const

/** The research goal of a framed project, one text as everywhere else in the app. */
export const composeGoal = (
  parts: { question: string; objectives: string; hypotheses: string },
  language: 'en' | 'fr',
): string => {
  const h = HEADINGS[language]
  return `${h.question}\n${parts.question}\n\n${h.objectives}\n${parts.objectives}\n\n${h.hypotheses}\n${parts.hypotheses || h.none}`
}
