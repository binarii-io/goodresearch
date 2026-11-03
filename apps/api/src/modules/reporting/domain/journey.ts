/**
 * Spec 017: the five steps of a project's research, from the fieldwork to the debrief. The first
 * step holds the interviews and, since spec 028, the counted responses of survey studies.
 */
export type StepState = 'empty' | 'to-decide' | 'done'

export type StepCounts = {
  readonly total: number
  readonly validated: number
  readonly toDecide: number
}

/** What the first step reports beyond the interviews: which kinds of study, and the responses. */
export type Fieldwork = {
  readonly participants: number
  /** Responses counted by the survey studies (spec 028). */
  readonly responses: number
  /** Responses received, counted or set aside by the target rule. */
  readonly received: number
  readonly kinds: { readonly interviews: boolean; readonly surveys: boolean }
}

export type JourneyCounts = {
  readonly interviews: StepCounts & Fieldwork
  readonly facts: StepCounts
  readonly insights: StepCounts
  readonly recommendations: StepCounts
  readonly takeawaysWritten: boolean
}

export type JourneyStep =
  | ({ readonly key: 'interviews'; readonly state: StepState } & StepCounts & Fieldwork)
  | ({
      readonly key: 'facts' | 'insights' | 'recommendations'
      readonly state: StepState
    } & StepCounts)
  | { readonly key: 'debrief'; readonly state: StepState }

/**
 * Some proposals are often left open while the research moves on: one validated interview is
 * enough. Interviews waiting for a decision keep the step open, even with responses counted;
 * responses all set aside by the target rule wait for a person too.
 */
const fieldworkState = (c: StepCounts & Fieldwork): StepState => {
  if (c.validated > 0) return 'done'
  if (c.total > 0) return 'to-decide'
  if (c.responses > 0) return 'done'
  return c.received > 0 ? 'to-decide' : 'empty'
}

const stateOf = (c: StepCounts): StepState =>
  c.total === 0 ? 'empty' : c.toDecide > 0 ? 'to-decide' : 'done'

export const stepsOf = (c: JourneyCounts): JourneyStep[] => [
  {
    key: 'interviews',
    state: fieldworkState(c.interviews),
    ...c.interviews,
  },
  { key: 'facts', state: stateOf(c.facts), ...c.facts },
  { key: 'insights', state: stateOf(c.insights), ...c.insights },
  { key: 'recommendations', state: stateOf(c.recommendations), ...c.recommendations },
  { key: 'debrief', state: c.takeawaysWritten ? 'done' : 'empty' },
]

/** The first step not done; null once all are. It advises, it never prevents anything. */
export const nextStep = (steps: readonly JourneyStep[]): JourneyStep['key'] | null =>
  steps.find((s) => s.state !== 'done')?.key ?? null
