import type {
  AiFailure,
  ChatMessage,
  Gateway,
  StreamPart,
  ToolSpec,
} from '../../ai-gateway/index.ts'
import type { GuidePoint, GuidePointState } from '../domain/guide-progress.ts'
import type { FramingPoint } from '../domain/project-framing.ts'
import type { ProposalKind, ProposalState } from '../domain/proposal.ts'
import type { QuestionIssue } from '../domain/question-checks.ts'

export type { AiFailure, ChatMessage, StreamPart, ToolSpec }

export type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type PageRef = {
  readonly kind: 'home' | 'project' | 'study' | 'teams' | 'members' | 'sources' | 'other'
  readonly id?: string | undefined
  readonly phase?: 'preparation' | 'fieldwork' | 'enrichment' | 'analysis' | undefined
}

export type Conversation = {
  readonly id: string
  readonly accountId: string
  readonly title: string
  readonly createdAt: Date
  readonly lastActivityAt: Date
}

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'failed'

export type StoredMessage = {
  readonly id: string
  readonly conversationId: string
  readonly role: 'person' | 'assistant'
  readonly text: string
  readonly status: MessageStatus
  readonly failure: AiFailure | null
  readonly pageKind: string | null
  readonly pageId: string | null
  readonly createdAt: Date
}

/** What a card shows (contracts `ProposalPreview`). */
export type ProposalPreview = {
  readonly projectName?: string
  readonly teamName?: string
  readonly name?: string
  readonly goal?: string
  readonly previousName?: string
  readonly previousGoal?: string
  readonly phase?: 'preparation' | 'fieldwork' | 'enrichment' | 'analysis'
  readonly studyName?: string
  readonly guide?: GuideDraft
  readonly replacesGuide?: boolean
  readonly progress?: {
    percent: number
    items: { key: GuidePoint | FramingPoint; weight: number; status: GuidePointState }[]
  }
  readonly checks?: { question: string; issues: QuestionIssue[] }[]
  readonly skill?: string
}

/**
 * An interview guide as the assistant reads and writes it: no ids (spec 006 research R4). Mutable
 * arrays: the same shape as the contracts' `GuideDraft`.
 */
export type GuideDraft = {
  framing: {
    objectives: string
    hypotheses: string[]
    audience: string
    format: string
  }
  sections: {
    kind: 'introduction' | 'warm-up' | 'theme' | 'wrap-up'
    title: string
    minutes: number
    questions: { text: string; followUps: string[] }[]
  }[]
}

/** What the assistant may know of a study's preparation; never names from the schedule. */
export type StudyPreparation = {
  readonly guide: { readonly version: number; readonly content: GuideDraft } | null
  readonly schedule: Readonly<Partial<Record<string, number>>>
}

export type StoredProposal = {
  /** Our id (cards, Apply); never the provider's. */
  readonly id: string
  /** The model's tool call id, used only to replay the conversation to the model. */
  readonly callId: string
  readonly messageId: string
  readonly kind: ProposalKind
  readonly targetId: string | null
  readonly targetVersion: number | null
  readonly values: Readonly<Record<string, unknown>>
  readonly preview: ProposalPreview
  readonly state: ProposalState
  readonly resultKind: 'project' | 'study' | null
  readonly resultId: string | null
  readonly error: string | null
  readonly decidedAt: Date | null
}

export interface AssistantStore {
  listConversations(accountId: string): Promise<Conversation[]>
  /** Only the owner's conversation (privacy, FR-008). */
  getConversation(accountId: string, conversationId: string): Promise<Conversation | null>
  createConversation(conversation: Conversation): Promise<void>
  updateConversation(
    conversationId: string,
    change: { title?: string; lastActivityAt?: Date },
  ): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  deleteConversationsOf(accountId: string): Promise<void>
  listMessages(conversationId: string): Promise<StoredMessage[]>
  saveMessage(message: StoredMessage): Promise<void>
  listProposals(conversationId: string): Promise<StoredProposal[]>
  saveProposal(proposal: StoredProposal): Promise<void>
  /**
   * Moves a proposal from one state to another only if it is still in `from` (one winner when two
   * requests race, spec 005 US3 "at most once"); true when this call made the change.
   */
  transitionProposal(id: string, from: ProposalState, to: StoredProposal): Promise<boolean>
  /** With its conversation's owner, to check who may decide it. */
  getProposal(proposalId: string): Promise<{ proposal: StoredProposal; ownerId: string } | null>
}

/** What the assistant may read of the research module, with the person's permissions. */
export interface ResearchReads {
  getProject(
    accountId: string,
    projectId: string,
  ): Promise<{
    id: string
    name: string
    goal: string
    team: { id: string; name: string }
    version: number
  } | null>
  listStudies(
    accountId: string,
    projectId: string,
  ): Promise<{ id: string; name: string; type: string; folderName: string | null }[] | null>
  getStudy(
    accountId: string,
    studyId: string,
  ): Promise<{
    id: string
    name: string
    type: string
    version: number
    project: { id: string; name: string }
  } | null>
  teamsOf(accountId: string): Promise<{ id: string; name: string }[]>
  /** Most recently updated first. */
  listProjects(accountId: string): Promise<{ id: string; name: string; team: { name: string } }[]>
  /** `null` without access to the study (folder included) or for another type than interviews. */
  preparation(accountId: string, studyId: string): Promise<StudyPreparation | null>
}

/** The research commands a proposal runs, with the person's permissions and validation. */
export interface ResearchActions {
  createProject(c: {
    actor: Actor
    name: string
    goal: string
    teamId: string
  }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  updateProjectGoal(c: {
    actor: Actor
    projectId: string
    goal: string
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  renameProject(c: {
    actor: Actor
    projectId: string
    name: string
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  createStudy(c: {
    actor: Actor
    projectId: string
    name: string
  }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  renameStudy(c: {
    actor: Actor
    studyId: string
    name: string
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** `version: null` when the study had no guide when it was proposed. */
  saveGuide(c: {
    actor: Actor
    studyId: string
    guide: GuideDraft
    version: number | null
  }): Promise<{ ok: true } | { ok: false; error: string }>
}

export type AssistantDeps = {
  readonly store: AssistantStore
  readonly gateway: Pick<Gateway, 'stream'>
  readonly research: ResearchReads
  readonly actions: ResearchActions
  /** Cost in USD of the model calls of each assistant message (AI Gateway). */
  readonly costs: (
    accountId: string,
    messageIds: readonly string[],
  ) => Promise<Map<string, number | null>>
  readonly clock: { now(): Date }
  readonly newId: () => string
  readonly log: { warn(object: object, message: string): void }
}
