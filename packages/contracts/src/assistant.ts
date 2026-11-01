import { z } from 'zod'
import { AiFailure } from './ai.ts'
import { Id, Timestamp } from './common.ts'
import { ProjectDeletion } from './overview.ts'
import { GuideDraft } from './preparation.ts'

/** The page the assistant is looking at (spec 005 US2); the server builds its context. */
export const AssistantPage = z
  .object({
    kind: z.enum(['home', 'project', 'study', 'teams', 'members', 'sources', 'other']),
    id: Id.optional(),
    /** The study tab the person is on. */
    phase: z.enum(['preparation', 'fieldwork', 'enrichment', 'analysis']).optional(),
  })
  .meta({ id: 'AssistantPage' })

export const ProposalKind = z.enum([
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
  'attach_study',
  'detach_study',
  'update_study_goal',
  'delete_project',
])

/** What the app's writing rules flag in a question (spec 006). */
export const QuestionIssue = z.enum([
  'closed',
  'leading',
  'hypothetical',
  'future',
  'solution',
  'double',
  'long',
])

/** The eight points of a guide design (spec 006 US1); the percentage is computed by the app. */
export const GuideProgress = z
  .object({
    percent: z.number().int().min(0).max(100),
    items: z.array(
      z.object({
        key: z.enum([
          'objectives',
          'hypotheses',
          'audience',
          'format',
          'intro',
          'themes',
          'followUps',
          'biasReview',
          // The points of a project framing (spec 018); `audience` and `hypotheses` are shared.
          'question',
          'decision',
          'team',
          // The points of a study framing (spec 021).
          'reuse',
          'goal',
          'place',
        ]),
        weight: z.number().int(),
        status: z.enum(['missing', 'partial', 'done']),
      }),
    ),
  })
  .meta({ id: 'GuideProgress' })

/** What a card shows: every value that will be written, and what it replaces. */
export const ProposalPreview = z
  .object({
    projectName: z.string().optional(),
    teamName: z.string().optional(),
    name: z.string().optional(),
    goal: z.string().optional(),
    previousName: z.string().optional(),
    previousGoal: z.string().optional(),
    /** For an opened study: the tab to show. */
    phase: z.enum(['preparation', 'fieldwork', 'enrichment', 'analysis']).optional(),
    studyName: z.string().optional(),
    /** Spec 020: the project a deletion is about. */
    projectId: Id.optional(),
    /** Spec 020: what deleting the project removes, when it was proposed. */
    deletion: ProjectDeletion.optional(),
    /** Spec 019: the other projects of a study attached or detached. */
    otherProjects: z.array(z.string()).optional(),
    /** A proposed interview guide (spec 006). */
    guide: GuideDraft.optional(),
    /** Whether the proposed guide replaces an existing one. */
    replacesGuide: z.boolean().optional(),
    /** A guide design progress report (spec 006). */
    progress: GuideProgress.optional(),
    /** Questions the writing rules flag (checked questions, or a proposed guide). */
    checks: z.array(z.object({ question: z.string(), issues: z.array(QuestionIssue) })).optional(),
    /** A loaded skill. */
    skill: z.string().optional(),
  })
  .meta({ id: 'ProposalPreview' })

export const Proposal = z
  .object({
    id: z.string(),
    kind: ProposalKind,
    state: z.enum(['proposed', 'applied', 'dismissed', 'failed']),
    preview: ProposalPreview,
    result: z.object({ kind: z.enum(['project', 'study']), id: Id }).nullable(),
    /** Error code of a failed apply (same codes as the app's own forms). */
    error: z.string().nullable(),
  })
  .meta({ id: 'Proposal' })

export const AssistantMessage = z
  .object({
    id: Id,
    role: z.enum(['person', 'assistant']),
    text: z.string(),
    status: z.enum(['complete', 'streaming', 'stopped', 'failed']),
    failure: AiFailure.nullable(),
    proposals: z.array(Proposal),
    createdAt: Timestamp,
  })
  .meta({ id: 'AssistantMessage' })

export const ConversationSummary = z
  .object({ id: Id, title: z.string(), lastActivityAt: Timestamp })
  .meta({ id: 'ConversationSummary' })

/** Cost in USD from the dated price catalog; `null` when a model has no price (spec 005 US6). */
export const ConversationCost = z
  .object({
    currency: z.literal('USD'),
    total: z.number().nullable(),
    last: z.number().nullable(),
  })
  .meta({ id: 'ConversationCost' })

export const ConversationDetail = z
  .object({
    id: Id,
    title: z.string(),
    messages: z.array(AssistantMessage),
    cost: ConversationCost,
  })
  .meta({ id: 'ConversationDetail' })

export const ConversationParams = z.object({ conversationId: Id })
export const ProposalParams = z.object({ proposalId: z.string().max(200) })
export const RenameConversation = z
  .object({ title: z.string().trim().min(1).max(80) })
  .meta({ id: 'RenameConversation' })

export const SendAssistantMessage = z
  .object({
    text: z.string().trim().min(1).max(8000),
    page: AssistantPage,
    language: z.enum(['en', 'fr']),
  })
  .meta({ id: 'SendAssistantMessage' })

/** Asks for the answer that follows an applied project, without a message (spec 018 US3). */
export const ContinueAssistantConversation = z
  .object({
    page: AssistantPage,
    language: z.enum(['en', 'fr']),
  })
  .meta({ id: 'ContinueAssistantConversation' })

/** Server-sent events of an answer (contracts/http-api.md); the client validates them. */
export const AssistantStreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), personMessageId: Id.optional(), assistantMessageId: Id }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('proposal'), proposal: Proposal }),
  z.object({ type: z.literal('done'), status: z.enum(['complete', 'stopped', 'failed']) }),
  z.object({ type: z.literal('error'), failure: AiFailure }),
])
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEvent>
