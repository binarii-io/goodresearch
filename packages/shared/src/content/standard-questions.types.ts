/** Fixed questions of a usability test (spec 036 FR-005, FR-006, FR-006a): one module per language (ADR-0006). */
export type Scale = { readonly points: number; readonly low: string; readonly high: string }

export type StandardQuestions = {
  /** System Usability Scale, version 1: ten items in their fixed order, five-point agreement scale. */
  readonly 'sus-v1': {
    readonly title: string
    readonly scale: Scale
    readonly items: readonly string[]
    /** Read or given to the participant, word for word (Brooke, 1996). */
    readonly instructions: string
    /** How it is administered, for the facilitator only: never read to the participant. */
    readonly facilitatorNote: string
  }
  /** Single Ease Question, version 1: asked after each task, seven points. */
  readonly 'seq-v1': { readonly title: string; readonly question: string; readonly scale: Scale }
  /** Defaults offered when a protocol is written by hand. */
  readonly defaults: { readonly consent: string; readonly thinkAloud: string }
}
