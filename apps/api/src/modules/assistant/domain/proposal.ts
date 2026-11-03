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
  'report_project_progress',
  'report_study_progress',
  'load_skill',
  'check_guide_questions',
  'propose_questionnaire',
  'report_questionnaire_progress',
  'check_questionnaire_items',
  'count_responses',
  'propose_opening_form',
  'propose_closing_form',
  'propose_target_rule',
  'survey_analysis_state',
  'read_figures',
  'propose_survey_facts',
  'propose_theme_analysis',
  'attach_study',
  'detach_study',
  'update_study_goal',
  'delete_project',
  'attach_folder',
  'connect_source',
  'offer_choices',
  'publish_preparation',
  'browse_folder',
  'read_file',
  'propose_folder_changes',
  'folder_consent',
  'find_files',
  'count_interviews',
  'list_interviews',
  'propose_analysis',
  'propose_accepting_suggestions',
  'propose_validating_interviews',
  'propose_excluding_interviews',
] as const
export type ProposalKind = (typeof PROPOSAL_KINDS)[number]

/** Opening a page changes no data: it runs at once, without a card to confirm (spec 005 US5). */
export const isNavigation = (kind: ProposalKind): boolean =>
  kind === 'open_project' || kind === 'open_study'

/** Spec 019: cards the model learns about at once, like a new project. */
export const isStudyChange = (kind: ProposalKind): boolean =>
  kind === 'attach_study' || kind === 'detach_study' || kind === 'update_study_goal'

/** Spec 025: cards whose lines the person ticks, on interviews. */
export const isInterviewCard = (kind: ProposalKind): boolean =>
  kind === 'propose_accepting_suggestions' ||
  kind === 'propose_validating_interviews' ||
  kind === 'propose_excluding_interviews'

/**
 * Run by the app during the answer, their output given back to the model (spec 006). So is a new
 * project: the model learns at once why it was refused (spec 018).
 */
export const isRunDuringAnswer = (kind: ProposalKind): boolean =>
  kind === 'load_skill' ||
  kind === 'check_guide_questions' ||
  kind === 'check_questionnaire_items' ||
  kind === 'count_responses' ||
  kind === 'survey_analysis_state' ||
  kind === 'read_figures' ||
  kind === 'propose_theme_analysis' ||
  kind === 'create_project' ||
  kind === 'create_study' ||
  kind === 'attach_folder' ||
  kind === 'publish_preparation' ||
  kind === 'browse_folder' ||
  kind === 'find_files' ||
  kind === 'read_file' ||
  kind === 'count_interviews' ||
  kind === 'list_interviews' ||
  kind === 'propose_analysis' ||
  isInterviewCard(kind) ||
  kind === 'propose_folder_changes' ||
  isStudyChange(kind) ||
  kind === 'delete_project'

/**
 * Recorded at once when called, without a card. The progress report ends the answer (the skill
 * asks for it last): running it would cost one more model step for a "Recorded" (PR #6 review).
 */
export const isRecordedAtOnce = (kind: ProposalKind): boolean =>
  kind === 'report_guide_progress' ||
  kind === 'report_questionnaire_progress' ||
  kind === 'report_project_progress' ||
  kind === 'report_study_progress' ||
  kind === 'offer_choices'

/** What the assistant does on its way to an answer: it says nothing by itself (spec 024). */
export const isActivity = (kind: ProposalKind): boolean =>
  kind === 'load_skill' ||
  kind === 'check_guide_questions' ||
  kind === 'check_questionnaire_items' ||
  kind === 'count_responses' ||
  kind === 'survey_analysis_state' ||
  kind === 'read_figures' ||
  kind === 'browse_folder' ||
  kind === 'find_files' ||
  kind === 'read_file' ||
  kind === 'count_interviews' ||
  kind === 'list_interviews'

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
