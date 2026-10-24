import { err, ok, type Result } from '@goodresearch/shared'

/**
 * Actions the assistant may call (spec 005 US3, US5): changes run only on the person's Apply;
 * opening a page runs at once.
 */
export const PROPOSAL_KINDS = [
  'create_project',
  'update_project_goal',
  'rename_project',
  'create_study',
  'rename_study',
  'open_project',
  'open_study',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

/** Opening a page changes no data: it runs at once, without a card to confirm (spec 005 US5). */
export const isNavigation = (kind: ProposalKind): boolean =>
  kind === 'open_project' || kind === 'open_study'

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
