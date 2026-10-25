import { err, ok, type Result } from '@goodresearch/shared'

/**
 * Actions the assistant may call (spec 005 US3, US5, spec 006): changes run only on the person's
 * Apply; opening a page runs at once; loading a skill, checking questions and reporting the guide
 * design progress are run by the app during the answer.
 */
export const PROPOSAL_KINDS = [
  'create_project',
  'update_project_goal',
  'rename_project',
  'create_study',
  'rename_study',
  'open_project',
  'open_study',
  'propose_interview_guide',
  'report_guide_progress',
  'load_skill',
  'check_guide_questions',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

/** Opening a page changes no data: it runs at once, without a card to confirm (spec 005 US5). */
export const isNavigation = (kind: ProposalKind): boolean =>
  kind === 'open_project' || kind === 'open_study'

/** Run by the app during the answer, their output given back to the model (spec 006). */
export const isRunDuringAnswer = (kind: ProposalKind): boolean =>
  kind === 'load_skill' || kind === 'check_guide_questions'

/**
 * Recorded at once when called, without a card. The progress report ends the answer (the skill
 * asks for it last): running it would cost one more model step for a "Recorded" (PR #6 review).
 */
export const isRecordedAtOnce = (kind: ProposalKind): boolean => kind === 'report_guide_progress'

export const isProposalKind = (name: string): name is ProposalKind =>
  (PROPOSAL_KINDS as readonly string[]).includes(name)

/**
 * `invalid`: the model's values failed validation; never shown, told to the model. `applying`:
 * claimed by one Apply while the action runs, so a second Apply cannot run it again.
 */
export type ProposalState = 'proposed' | 'applying' | 'applied' | 'dismissed' | 'failed' | 'invalid'

/** A proposal is decided once, by its owner (data-model.md). */
export const decideProposal = (
  from: ProposalState,
  to: 'applying' | 'dismissed',
): Result<ProposalState, 'PROPOSAL_DECIDED'> =>
  from === 'proposed' ? ok(to) : err('PROPOSAL_DECIDED')
