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

export type Framing = {
  percent: number
  items: { key: FramingPoint; weight: number; status: GuidePointState }[]
}

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
 * The framing under way in a conversation: its latest report, unless a project was applied since,
 * which ends it. Compared by time: proposals have no order, and a card applied late ends the
 * reports made while it was open.
 */
export const currentFraming = (proposals: readonly ProposalFacts[]): Framing | null => {
  const latest = proposals
    .filter((p) => p.kind === 'report_project_progress' && p.state === 'applied')
    .reduce<ProposalFacts | null>((a, p) => (!a || timeOf(p) >= timeOf(a) ? p : a), null)
  if (!latest) return null
  const ended = proposals.some(
    (p) => p.kind === 'create_project' && p.state === 'applied' && timeOf(p) >= timeOf(latest),
  )
  return ended ? null : ((latest.preview.progress as Framing | undefined) ?? null)
}

/** The points not done yet; all of them without a framing. */
export const openPoints = (framing: Framing | null): FramingPoint[] =>
  framing
    ? framing.items.filter((i) => i.status !== 'done').map((i) => i.key)
    : FRAMING_CHECKLIST.map(([key]) => key)

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
