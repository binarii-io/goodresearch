/** Spec 017: the five steps of a project's research, from the interviews to the debrief. */
export type StepState = 'empty' | 'to-decide' | 'done'

export type StepCounts = {
  readonly total: number
  readonly validated: number
  readonly toDecide: number
}

export type JourneyCounts = {
  readonly interviews: StepCounts & { readonly participants: number }
  readonly facts: StepCounts
  readonly insights: StepCounts
  readonly recommendations: StepCounts
  readonly takeawaysWritten: boolean
}

export type JourneyStep =
  | ({ readonly key: 'interviews'; readonly state: StepState } & StepCounts & {
        readonly participants: number
      })
  | ({
      readonly key: 'facts' | 'insights' | 'recommendations'
      readonly state: StepState
    } & StepCounts)
  | { readonly key: 'debrief'; readonly state: StepState }

const stateOf = (c: StepCounts): StepState =>
  c.total === 0 ? 'empty' : c.toDecide > 0 ? 'to-decide' : 'done'

export const stepsOf = (c: JourneyCounts): JourneyStep[] => [
  {
    key: 'interviews',
    // Some proposals are often left open while the research moves on: one validated is enough.
    state: c.interviews.total === 0 ? 'empty' : c.interviews.validated > 0 ? 'done' : 'to-decide',
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
