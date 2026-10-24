import { z } from 'zod'
import { AiFailure } from './ai.ts'
import { Id, Timestamp } from './common.ts'

/** The page the assistant is looking at (spec 005 US2); the server builds its context. */
export const AssistantPage = z
  .object({
    kind: z.enum(['home', 'project', 'study', 'teams', 'members', 'sources', 'other']),
    id: Id.optional(),
    /** The study tab the person is on. */
    phase: z.enum(['preparation', 'fieldwork', 'analysis']).optional(),
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
])

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
    phase: z.enum(['preparation', 'fieldwork', 'analysis']).optional(),
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

/** Server-sent events of an answer (contracts/http-api.md); the client validates them. */
export const AssistantStreamEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), personMessageId: Id, assistantMessageId: Id }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('proposal'), proposal: Proposal }),
  z.object({ type: z.literal('done'), status: z.enum(['complete', 'stopped', 'failed']) }),
  z.object({ type: z.literal('error'), failure: AiFailure }),
])
export type AssistantStreamEvent = z.infer<typeof AssistantStreamEvent>
