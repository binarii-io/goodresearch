import type { ItemFlag, QuestionnaireDraft, QuestionnaireFlag } from '@goodresearch/contracts'
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
import type { QuestionnairePoint } from '../domain/questionnaire-progress.ts'
import type { StudyFramingPoint } from '../domain/study-framing.ts'

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
  readonly studyId?: string
  readonly folderName?: string
  readonly folderOwner?: string
  readonly opensOn?: 'preparation' | 'fieldwork'
  readonly documents?: PublishableKind[]
  readonly access?: 'read' | 'write'
  readonly interviewLines?: Omit<InterviewCardLine, 'version'>[]
  readonly interviews?: number
  readonly estimatedCost?: number | null
  readonly consentNeeded?: boolean
  readonly fileName?: string
  readonly provider?: string
  readonly lines?: {
    index: number
    kind: 'new-folder' | 'rename' | 'move'
    before: string
    after: string
    dependsOn: number | null
    outcome?: string
  }[]
  readonly question?: string
  readonly choices?: string[]
  readonly multiple?: boolean
  readonly goal?: string
  readonly previousName?: string
  readonly previousGoal?: string
  readonly phase?: 'preparation' | 'fieldwork' | 'enrichment' | 'analysis'
  readonly studyName?: string
  readonly otherProjects?: string[]
  readonly projectId?: string
  readonly deletion?: {
    insights: number
    recommendations: number
    hasTakeaways: boolean
    hasPublishedDeck: boolean
    studies: number
    studiesWithoutProject: number
  }
  readonly type?: 'survey'
  readonly questionnaire?: QuestionnaireDraft
  readonly replacesQuestionnaire?: boolean
  readonly itemChecks?: ItemChecks
  readonly guide?: GuideDraft
  readonly replacesGuide?: boolean
  readonly progress?: {
    percent: number
    items: {
      key: GuidePoint | FramingPoint | StudyFramingPoint | QuestionnairePoint
      weight: number
      status: GuidePointState
    }[]
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
/** A line of a card on interviews, built by the app (spec 025). */
export type InterviewCardLine = {
  index: number
  interviewId: string
  interview: string
  version: number
  field: string | null
  fileId: string | null
  value: string
  flag: string | null
  reason: string | null
  outcome?: string
}

export type InterviewCardKind = 'suggestions' | 'validate' | 'exclude'

export type FileSearchKind = 'transcript' | 'recording' | 'document' | 'folder'

/** One line of a batch of changes in a study's folder, as the model sends it (spec 024). */
export type FolderLineInput =
  | { kind: 'new-folder'; key: string; name: string; parent: string }
  | { kind: 'rename'; fileId: string; name: string }
  | { kind: 'move'; fileId: string; to: string }

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
  /** Spec 027: the answers given on a study's page in conversations that loaded a skill. */
  answersWithSkill(studyId: string, skill: string): Promise<string[]>
  /** Only the owner's conversation (privacy, FR-008). */
  getConversation(accountId: string, conversationId: string): Promise<Conversation | null>
  createConversation(conversation: Conversation): Promise<void>
  updateConversation(
    conversationId: string,
    change: { title?: string; lastActivityAt?: Date },
  ): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  deleteConversationsOf(accountId: string): Promise<void>
  /** Spec 024: the person's consent to send this study's files to this provider. */
  hasFolderConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  saveFolderConsent(accountId: string, studyId: string, provider: string, at: Date): Promise<void>
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
    projects: readonly { id: string; name: string }[]
    goal: string
  } | null>
  /** Spec 026: for reading, open to every active member; the three above stay with the team. */
  readProject(
    accountId: string,
    projectId: string,
  ): Promise<{
    id: string
    name: string
    goal: string
    team: { id: string; name: string }
    version: number
  } | null>
  readStudies(
    accountId: string,
    projectId: string,
  ): Promise<{ id: string; name: string; type: string; folderName: string | null }[] | null>
  readStudy(
    accountId: string,
    studyId: string,
  ): Promise<{
    id: string
    name: string
    type: string
    goal: string
    projects: readonly { id: string; name: string }[]
    team: { id: string; name: string }
  } | null>
  teamsOf(accountId: string): Promise<{ id: string; name: string }[]>
  /** Spec 019: the team's studies, except those in this project; names and projects only. */
  attachableStudies(
    accountId: string,
    teamId: string,
    projectId: string | null,
  ): Promise<{ id: string; name: string; projects: readonly { name: string }[] }[]>
  studyInTeam(accountId: string, studyId: string, teamId: string): Promise<boolean>
  /** Spec 020: null without the right to delete this project. */
  projectDeletion(
    accountId: string,
    projectId: string,
  ): Promise<NonNullable<ProposalPreview['deletion']> | null>
  /** Spec 022: the study's folder for people with access to it; counts only, never a file name. */
  folderState(
    actor: Actor,
    studyId: string,
  ): Promise<{
    name: string
    status: string
    byKind: { transcript: number; media: number; other: number }
  } | null>
  /** Spec 022: what attaching this link would find, with the person's own access. */
  checkFolder(c: {
    actor: Actor
    studyId: string
    link: string
  }): Promise<
    { ok: true; folderName: string; folderOwner: string | null } | { ok: false; error: string }
  >
  /** Spec 025: numbers of interviews by state; no name. */
  interviewCounts(
    actor: Actor,
    studyId: string,
  ): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }>
  /** Spec 025: what comes next on the interviews, for the study's next step. */
  interviewsStep(
    actor: Actor,
    studyId: string,
  ): Promise<'none' | 'analyse' | 'decide' | 'validate' | 'done' | undefined>
  /** Spec 025: one page of what the filters select; names, never a transcript. */
  listInterviews(
    actor: Actor,
    studyId: string,
    search: {
      filters?: readonly string[] | undefined
      name?: string | undefined
      page?: number | undefined
    },
  ): Promise<{ ok: true; page: Record<string, unknown> } | { ok: false; error: string }>
  /** Spec 025: the lines of a card on interviews; nothing changes. */
  prepareInterviewCard(
    actor: Actor,
    studyId: string,
    kind: InterviewCardKind,
    items: readonly { interviewId: string; fields?: readonly string[]; reason?: string }[],
  ): Promise<{ ok: true; lines: InterviewCardLine[] } | { ok: false; error: string }>
  /** Spec 025: what analysing now would take. */
  analysisEstimate(
    actor: Actor,
    studyId: string,
    again: boolean,
  ): Promise<
    | {
        ok: true
        count: number
        estimatedCost: number | null
        consentNeeded: boolean
        aiConnected: boolean
        running: boolean
      }
    | { ok: false; error: string }
  >
  /** Spec 024: the AI provider this person's calls go to, null without one. */
  aiProvider(accountId: string): Promise<string | null>
  /** Spec 024: whether the assistant can work in this study's folder at all. */
  folderWorkAvailable(
    actor: Actor,
    studyId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>
  /** Spec 024: one folder of the study, with the person's own access. */
  browseFolder(
    actor: Actor,
    studyId: string,
    folderId?: string,
  ): Promise<
    | { ok: true; items: readonly Record<string, unknown>[]; cut: boolean }
    | { ok: false; error: string }
  >
  /** Spec 024: what matches a name or a kind in the study's folder. */
  findFiles(
    actor: Actor,
    studyId: string,
    search: { query?: string | undefined; kind?: FileSearchKind | undefined },
  ): Promise<
    | { ok: true; items: readonly Record<string, unknown>[]; cut: boolean }
    | { ok: false; error: string }
  >
  /** Spec 024: one extract of a file of the study's folder. */
  readFile(
    actor: Actor,
    studyId: string,
    fileId: string,
    part?: number,
  ): Promise<{ ok: true; name: string; text: string; more: boolean } | { ok: false; error: string }>
  /** Spec 024: what a batch would do; nothing changes. */
  checkFolderChanges(
    actor: Actor,
    studyId: string,
    lines: readonly FolderLineInput[],
  ): Promise<
    { ok: true; lines: NonNullable<ProposalPreview['lines']> } | { ok: false; error: string }
  >
  /** Spec 023: what publishing would create, with the person's own access. */
  checkPublication(c: {
    actor: Actor
    studyId: string
    kinds: readonly PublishableKind[]
  }): Promise<{ ok: true; kinds: PublishableKind[] } | { ok: false; error: string }>
  /** Spec 023: the documents of the study already published. */
  publishedKinds(actor: Actor, studyId: string): Promise<string[]>
  /** The person's file source is connected and allows this access. */
  sourceConnected(accountId: string, access: 'read' | 'write'): Promise<boolean>
  /** The person's own access to the study's folder (spec 002 FR-010a). */
  canActOnStudy(accountId: string, studyId: string): Promise<boolean>
  /** An insight or recommendation run is in progress on the project. */
  projectRunning(projectId: string): Promise<boolean>
  /** Most recently updated first. */
  listProjects(accountId: string): Promise<{ id: string; name: string; team: { name: string } }[]>
  /** `null` without access to the study (folder included) or for another type than interviews. */
  preparation(accountId: string, studyId: string): Promise<StudyPreparation | null>
  /** Spec 027: `null` without the right to change the study, or for another type than survey. */
  questionnaire(
    accountId: string,
    studyId: string,
  ): Promise<{
    version: number | null
    content: QuestionnaireDraft | null
    /** The human checks marked and still valid (US6). */
    checksDone: boolean
  } | null>
  /** The app's writing rules, as the tab shows them (spec 027 FR-007). */
  checkQuestionnaire(draft: QuestionnaireDraft): ItemChecks
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
  /** Without a goal (a card from before spec 021), it copies the project's. */
  createStudy(c: {
    actor: Actor
    projectId: string
    name: string
    goal?: string
    type?: 'survey'
  }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /** Spec 025: runs the lines kept of a card on interviews. */
  applyInterviewCard(c: {
    actor: Actor
    studyId: string
    kind: InterviewCardKind
    lines: readonly InterviewCardLine[]
    excluded: readonly number[]
    reasons: readonly { index: number; reason: string }[]
  }): Promise<{ ok: true; outcomes: string[] } | { ok: false; error: string }>
  /** Spec 025: starts the analysis, with the consent the card states. */
  startAnalysis(c: {
    actor: Actor
    studyId: string
    consent: boolean
    all: boolean
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** Spec 024: runs the lines kept; each gives its outcome. */
  applyFolderChanges(c: {
    actor: Actor
    studyId: string
    lines: readonly FolderLineInput[]
    excluded: readonly number[]
  }): Promise<{ ok: true; outcomes: string[] } | { ok: false; error: string }>
  /** Spec 023: creates the documents in the study's folder. */
  publishPreparation(c: {
    actor: Actor
    studyId: string
    kinds: readonly PublishableKind[]
    language: 'en' | 'fr'
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** Spec 022: never replaces a folder. */
  attachFolder(c: {
    actor: Actor
    studyId: string
    link: string
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** Spec 021: a study in no project. */
  createTeamStudy(c: {
    actor: Actor
    teamId: string
    name: string
    goal: string
    type?: 'survey'
  }): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  deleteProject(c: {
    actor: Actor
    projectId: string
    name: string
  }): Promise<{ ok: true } | { ok: false; error: string }>
  attachStudy(c: {
    actor: Actor
    projectId: string
    studyId: string
  }): Promise<{ ok: true } | { ok: false; error: string }>
  detachStudy(c: {
    actor: Actor
    projectId: string
    studyId: string
  }): Promise<{ ok: true } | { ok: false; error: string }>
  updateStudyGoal(c: {
    actor: Actor
    studyId: string
    goal: string
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  renameStudy(c: {
    actor: Actor
    studyId: string
    name: string
    version: number
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** `version: null` when the study had no questionnaire when it was proposed. */
  saveQuestionnaire(c: {
    actor: Actor
    studyId: string
    questionnaire: QuestionnaireDraft
    version: number | null
  }): Promise<{ ok: true } | { ok: false; error: string }>
  /** `version: null` when the study had no guide when it was proposed. */
  saveGuide(c: {
    actor: Actor
    studyId: string
    guide: GuideDraft
    version: number | null
  }): Promise<{ ok: true } | { ok: false; error: string }>
}

export type PublishableKind = 'guide' | 'best-practices' | 'questionnaire'

export type ItemChecks = {
  items: { text: string; flags: ItemFlag[] }[]
  whole: QuestionnaireFlag[]
  estimatedMinutes: number
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
  /** Whoever spent them (spec 027 FR-012). */
  readonly studyCosts: (refs: readonly string[]) => Promise<Map<string, number | null>>
  readonly clock: { now(): Date }
  readonly newId: () => string
  readonly log: { warn(object: object, message: string): void }
}
