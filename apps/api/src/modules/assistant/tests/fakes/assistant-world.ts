import { fixedClock, newId } from '@goodresearch/shared'
import { makeConversationCommands } from '../../application/commands/conversation-commands.ts'
import { makeProposalCommands } from '../../application/commands/proposal-commands.ts'
import { makeSendMessage } from '../../application/commands/send-message.ts'
import type {
  AssistantDeps,
  AssistantStore,
  Conversation,
  ResearchActions,
  ResearchReads,
  StoredMessage,
  StoredProposal,
  StreamPart,
} from '../../application/ports.ts'
import { makeConversationQueries } from '../../application/queries/conversation-queries.ts'
import type { ChatMessage, ModelRequestLike } from './types.ts'

const newFolderWork = () => ({
  consents: new Set<string>(),
  lastCard: '' as string,
  linesResult: {
    ok: true,
    lines: [
      {
        index: 0,
        interviewId: 'i1',
        interview: 'Nadia',
        version: 3,
        field: 'date',
        fileId: null,
        value: '2026-10-23',
        flag: null,
        reason: null,
      },
    ],
  } as Awaited<ReturnType<ResearchReads['prepareInterviewCard']>>,
  lastSearch: {} as Parameters<ResearchReads['listInterviews']>[2],
  counts: { ok: true, counts: { total: 5, 'to-decide': 2 } } as Awaited<
    ReturnType<ResearchReads['interviewCounts']>
  >,
  interviews: {
    ok: true,
    page: { items: [{ id: 'i1', title: 'Nadia' }], matched: 1, page: 1, pages: 1 },
  } as Awaited<ReturnType<ResearchReads['listInterviews']>>,
  estimate: {
    ok: true,
    count: 3,
    estimatedCost: 0.02,
    consentNeeded: true,
    aiConnected: true,
    running: false,
  } as Awaited<ReturnType<ResearchReads['analysisEstimate']>>,
  available: { ok: true } as Awaited<ReturnType<ResearchReads['folderWorkAvailable']>>,
  provider: 'anthropic' as string | null,
  browse: {
    ok: true,
    items: [{ id: 'f1', name: 'Interview Sam.txt', isFolder: false }],
    cut: false,
  } as Awaited<ReturnType<ResearchReads['browseFolder']>>,
  read: { ok: true, name: 'Interview Sam.txt', text: 'Hello', more: false } as Awaited<
    ReturnType<ResearchReads['readFile']>
  >,
  check: {
    ok: true,
    lines: [
      { index: 0, kind: 'new-folder', before: 'Study', after: 'Study / To sort', dependsOn: null },
      { index: 1, kind: 'move', before: 'Week / A', after: 'To sort / A', dependsOn: 0 },
    ],
  } as Awaited<ReturnType<ResearchReads['checkFolderChanges']>>,
  outcomes: ['done', 'skipped'],
})

let folderWork = newFolderWork()

export const inMemoryAssistantStore = () => {
  const conversations = new Map<string, Conversation>()
  const messages: StoredMessage[] = []
  const proposalRows = new Map<string, StoredProposal>()
  const store: AssistantStore = {
    answersWithSkill: async (studyId, skill) => {
      const designing = new Set(
        [...proposalRows.values()]
          .filter(
            (p) => p.kind === 'load_skill' && p.state === 'applied' && p.values.name === skill,
          )
          .map((p) => messages.find((m) => m.id === p.messageId))
          .filter((m) => m?.pageId === studyId)
          .map((m) => m?.conversationId),
      )
      return messages
        .filter(
          (m) => designing.has(m.conversationId) && m.role === 'assistant' && m.pageId === studyId,
        )
        .map((m) => m.id)
    },
    answersWithCard: async (studyId, kind) => {
      const conversations = new Set(
        [...proposalRows.values()]
          .filter((p) => p.kind === kind)
          .map((p) => messages.find((m) => m.id === p.messageId))
          .filter((m) => m?.pageId === studyId)
          .map((m) => m?.conversationId),
      )
      return messages
        .filter(
          (m) =>
            conversations.has(m.conversationId) && m.role === 'assistant' && m.pageId === studyId,
        )
        .map((m) => m.id)
    },
    listConversations: async (accountId) =>
      [...conversations.values()]
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime()),
    getConversation: async (accountId, id) => {
      const c = conversations.get(id)
      return c && c.accountId === accountId ? c : null
    },
    createConversation: async (c) => {
      conversations.set(c.id, c)
    },
    updateConversation: async (id, change) => {
      const c = conversations.get(id)
      if (c) conversations.set(id, { ...c, ...change })
    },
    deleteConversation: async (id) => {
      conversations.delete(id)
    },
    hasFolderConsent: async (accountId, studyId, provider) =>
      folderWork.consents.has(`${accountId}:${studyId}:${provider}`),
    saveFolderConsent: async (accountId, studyId, provider) => {
      folderWork.consents.add(`${accountId}:${studyId}:${provider}`)
    },
    deleteConversationsOf: async (accountId) => {
      for (const c of [...conversations.values()])
        if (c.accountId === accountId) conversations.delete(c.id)
    },
    listMessages: async (conversationId) =>
      messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    saveMessage: async (m) => {
      const i = messages.findIndex((x) => x.id === m.id)
      if (i >= 0) messages[i] = m
      else messages.push(m)
    },
    listProposals: async (conversationId) => {
      const ids = new Set(
        messages.filter((m) => m.conversationId === conversationId).map((m) => m.id),
      )
      return [...proposalRows.values()].filter((p) => ids.has(p.messageId))
    },
    saveProposal: async (p) => {
      proposalRows.set(p.id, p)
    },
    transitionProposal: async (id, from, to) => {
      if (proposalRows.get(id)?.state !== from) return false
      proposalRows.set(id, to)
      return true
    },
    getProposal: async (id) => {
      const proposal = proposalRows.get(id)
      if (!proposal) return null
      const message = messages.find((m) => m.id === proposal.messageId)
      const owner = message ? conversations.get(message.conversationId)?.accountId : undefined
      return owner ? { proposal, ownerId: owner } : null
    },
  }
  return { store, conversations, messages, proposalRows }
}

/** Ada sees project p1 (team t1) and its study s1 with folder access; Bob sees nothing. */
export const fakeResearch = () => {
  const project = {
    id: 'p1',
    name: 'Onboarding',
    goal: 'Old goal',
    team: { id: 't1', name: 'Growth' },
    version: 3,
  }
  const study = {
    id: 's1',
    name: 'First interviews',
    type: 'interviews',
    version: 1,
    projects: [{ id: 'p1', name: 'Onboarding' }],
    goal: 'Study goal',
  }
  const actionsLog: { action: string; input: unknown }[] = []
  let nextError: string | null = null
  const preparation: { guide: Awaited<ReturnType<ResearchReads['preparation']>> } = {
    guide: { guide: null, schedule: { scheduled: 2, 'to-contact': 1 } },
  }
  const survey: { progress: Awaited<ReturnType<ResearchReads['surveyProgress']>> } = {
    progress: {
      publicationId: 'pub-1',
      accepting: false,
      counts: { total: 10, counted: 6, outOfTarget: 3, profileNotAnswered: 1, refusedConsent: 0 },
      target: 100,
      ruleVersion: null,
    },
  }
  const questionnaire: { value: Awaited<ReturnType<ResearchReads['questionnaire']>> } = {
    value: null,
  }
  const protocol: { value: Awaited<ReturnType<ResearchReads['testProtocol']>> } = {
    value: null,
  }
  const attachable: {
    studies: { id: string; name: string; projects: { name: string }[] }[]
  } = { studies: [] }
  const running = { value: false }
  const publication: {
    check: Awaited<ReturnType<ResearchReads['checkPublication']>>
    published: string[]
  } = { check: { ok: true, kinds: ['guide', 'best-practices'] }, published: [] }
  const folder: {
    state: Awaited<ReturnType<ResearchReads['folderState']>>
    check: Awaited<ReturnType<ResearchReads['checkFolder']>>
    connected: boolean
    canEdit: boolean
  } = {
    state: {
      name: 'Interviews Q4',
      status: 'done',
      byKind: { transcript: 3, media: 2, other: 1 },
    },
    check: { ok: true, folderName: 'Interviews Q4', folderOwner: 'Sam' },
    connected: true,
    canEdit: true,
  }
  let deleteThrows = false
  let createThrows = false
  const deletion: { value: Awaited<ReturnType<ResearchReads['projectDeletion']>> } = {
    value: {
      insights: 3,
      recommendations: 1,
      hasTakeaways: true,
      hasPublishedDeck: false,
      studies: 2,
      studiesWithoutProject: 1,
    },
  }
  const reads: ResearchReads = {
    getProject: async (accountId, id) => (accountId === 'ada' && id === 'p1' ? project : null),
    listStudies: async (accountId, id) =>
      accountId === 'ada' && id === 'p1'
        ? [{ id: 's1', name: study.name, type: 'interviews', folderName: 'Interviews Q4' }]
        : null,
    getStudy: async (accountId, id) => (accountId === 'ada' && id === 's1' ? study : null),
    readProject: async (accountId, id) => (accountId === 'ada' && id === 'p1' ? project : null),
    readStudies: async () => null,
    readStudy: async (accountId, id) =>
      accountId === 'ada' && id === 's1' ? { ...study, team: { id: 't1', name: 'Growth' } } : null,
    teamsOf: async (accountId) => (accountId === 'ada' ? [{ id: 't1', name: 'Growth' }] : []),
    listProjects: async (accountId) =>
      accountId === 'ada' ? [{ id: 'p1', name: 'Onboarding', team: { name: 'Growth' } }] : [],
    attachableStudies: async () => attachable.studies,
    projectDeletion: async () => deletion.value,
    studyInTeam: async (_accountId, _studyId, teamId) => teamId === 't1',
    folderState: async (actor, id) => (actor.id === 'ada' && id === 's1' ? folder.state : null),
    checkFolder: async () => folder.check,
    sourceConnected: async (_accountId, access) =>
      folder.connected && (access === 'read' || folder.canEdit),
    checkPublication: async () => publication.check,
    aiProvider: async () => folderWork.provider,
    folderWorkAvailable: async () => folderWork.available,
    usabilityAnalysis: async () => null,
    interviewCounts: async () => folderWork.counts,
    interviewsStep: async () => undefined,
    listInterviews: async (_actor, _studyId, search) => {
      folderWork.lastSearch = search
      return folderWork.interviews
    },
    prepareInterviewCard: async (_actor, _studyId, kind) => {
      folderWork.lastCard = kind
      return folderWork.linesResult
    },
    analysisEstimate: async () => folderWork.estimate,
    browseFolder: async () => folderWork.browse,
    findFiles: async () => folderWork.browse,
    readFile: async () => folderWork.read,
    checkFolderChanges: async () => folderWork.check,
    publishedKinds: async () => publication.published,
    canActOnStudy: async () => true,
    projectRunning: async () => running.value,
    questionnaire: async (accountId, id) =>
      accountId === 'ada' && id === 's1' ? questionnaire.value : null,
    testProtocol: async (accountId, id) =>
      accountId === 'ada' && id === 's1' ? protocol.value : null,
    checkTestProtocol: (draft) => ({
      tasks: draft.tasks.map((t) => ({
        instruction: t.instruction,
        flags: /click/i.test(t.instruction) ? (['gives-the-way'] as const).slice() : [],
      })),
      whole: [],
      plannedMinutes: 20,
    }),
    surveyProgress: async () => survey.progress,
    // Spec 029: counts and figures only; the answers never reach this fake.
    surveyAnalysisState: async () => ({
      counted: 6,
      setAside: 4,
      openItems: [{ id: 'open-1', text: 'Tell us more', answers: 6, themes: 0, themed: 0 }],
      facts: { total: 0, toDecide: 0, accepted: 0 },
    }),
    surveyFigures: async (_a, _s, crossBy) =>
      `Counted responses: 6.\n- scale-1 "Planning is easy" (likert): base 6 (small); agree 50 %${crossBy ? ' (crossed)' : ''}`,
    surveyFigureValues: async (_a, _s, refs) =>
      refs.map((ref) =>
        ref.itemId === 'scale-1'
          ? { item: 'Planning is easy', cross: null, value: 50, base: 6, smallBase: true }
          : null,
      ),
    themesEstimate: async (_actor, _s, itemId) =>
      itemId === 'open-1'
        ? {
            ok: true as const,
            text: 'Tell us more',
            answers: 6,
            parts: 1,
            cost: 0.01,
            aiConnected: true,
          }
        : { ok: false as const, error: 'ITEM_NOT_FOUND' },
    previewTargetRule: async (_a, _s, accepted) =>
      Object.keys(accepted).includes('job')
        ? {
            items: [{ text: 'Job', accepted: accepted.job ?? [] }],
            setAside: 4,
            total: 10,
          }
        : null,
    checkQuestionnaire: (draft) => ({
      items: draft.sections.flatMap((s) =>
        s.items.map((i) => ({
          text: i.text,
          flags: i.text.includes(' and ') ? (['double'] as const).slice() : [],
        })),
      ),
      whole: ['no-profiling'],
      estimatedMinutes: 3,
    }),
    preparation: async (accountId, id) =>
      accountId === 'ada' && id === 's1' ? preparation.guide : null,
  }
  const result = <T extends object>(action: string, input: unknown, value: T) => {
    actionsLog.push({ action, input })
    if (nextError) {
      const error = nextError
      nextError = null
      return { ok: false as const, error }
    }
    return { ok: true as const, ...value }
  }
  const actions: ResearchActions = {
    createProject: async (c) => result('createProject', c, { id: 'p-new' }),
    updateProjectGoal: async (c) => result('updateProjectGoal', c, {}),
    renameProject: async (c) => result('renameProject', c, {}),
    createStudy: async (c) => {
      if (createThrows) throw new Error('down')
      return result('createStudy', c, { id: 's-new' })
    },
    attachFolder: async (c) => result('attachFolder', c, {}),
    publishPreparation: async (c) => result('publishPreparation', c, {}),
    startAnalysis: async (c) => result('startAnalysis', c, {}),
    applyInterviewCard: async (c) => result('applyInterviewCard', c, { outcomes: ['done'] }),
    applyFolderChanges: async (c) =>
      result('applyFolderChanges', c, { outcomes: folderWork.outcomes }),
    createTeamStudy: async (c) => result('createTeamStudy', c, { id: 's-new' }),
    renameStudy: async (c) => result('renameStudy', c, {}),
    attachStudy: async (c) => result('attachStudy', c, {}),
    deleteProject: async (c) => {
      if (deleteThrows) throw new Error('down')
      return result('deleteProject', c, {})
    },
    detachStudy: async (c) => result('detachStudy', c, {}),
    updateStudyGoal: async (c) => result('updateStudyGoal', c, {}),
    saveGuide: async (c) => result('saveGuide', c, {}),
    saveQuestionnaire: async (c) => result('saveQuestionnaire', c, {}),
    saveTestProtocol: async (c) => result('saveTestProtocol', c, {}),
    setFormOpen: async (c) => result('setFormOpen', c, {}),
    saveTargetRule: async (c) => result('saveTargetRule', c, {}),
    createSurveyFacts: async (c) => result('createSurveyFacts', c, { made: c.facts.length }),
    startThemes: async (c) => result('startThemes', c, {}),
  }
  return {
    reads,
    attachable,
    running,
    renameProject: (name: string) => {
      project.name = name
    },
    folder,
    publication,
    folderWork,
    throwOnDelete: () => {
      deleteThrows = true
    },
    failNextCreate: () => {
      createThrows = true
    },
    deletion,
    study,
    preparation,
    questionnaire,
    protocol,
    survey,
    actions,
    actionsLog,
    failNext: (error: string) => {
      nextError = error
    },
  }
}

/** A gateway that streams the next scripted parts and records what it was asked. */
export const scriptedGateway = () => {
  const requests: ModelRequestLike[] = []
  const outputs: string[] = []
  let script: StreamPart[] = [{ type: 'text', delta: 'Hello' }]
  let failure: Error | null = null
  const gateway: AssistantDeps['gateway'] = {
    stream: async (_accountId, _task, request) => {
      requests.push(request)
      const parts = script
      const fail = failure
      failure = null
      // Like the AI SDK: tools the app runs are run when called, their output kept for the test.
      async function* generate(): AsyncGenerator<StreamPart> {
        for (const part of parts) {
          yield part
          const tool =
            part.type === 'tool-call' ? request.tools?.find((t) => t.name === part.call.name) : null
          if (part.type === 'tool-call' && tool?.run)
            outputs.push(await tool.run(part.call.input, part.call))
        }
        if (fail) throw fail
      }
      const done = Promise.resolve({ inputTokens: 1, outputTokens: 1 })
      return { parts: generate(), done }
    },
  }
  return {
    gateway,
    requests,
    outputs,
    answer: (parts: StreamPart[]) => {
      script = parts
    },
    failWith: (error: Error) => {
      failure = error
    },
  }
}

export const assistantWorld = () => {
  folderWork = newFolderWork()
  const clock = fixedClock(new Date('2026-10-24T10:00:00Z'))
  const memory = inMemoryAssistantStore()
  const research = fakeResearch()
  const model = scriptedGateway()
  const deps: AssistantDeps = {
    store: memory.store,
    gateway: model.gateway,
    research: research.reads,
    actions: research.actions,
    costs: async (_accountId, ids) => new Map(ids.map((id, i) => [id, 0.001 * (i + 1)])),
    studyCosts: async (ids) => new Map(ids.map((id) => [id, 0.01])),
    clock,
    newId,
    log: { warn: () => {} },
  }
  return {
    ...memory,
    research,
    model,
    clock,
    conversations: makeConversationCommands(deps),
    send: makeSendMessage(deps),
    proposals: makeProposalCommands(deps),
    queries: makeConversationQueries(deps),
    history: (): readonly ChatMessage[] => model.requests.at(-1)?.messages ?? [],
    /** Our proposal id for a model call id. */
    idOf: (callId: string) =>
      [...memory.proposalRows.values()].find((p) => p.callId === callId)?.id ?? 'unknown',
  }
}
