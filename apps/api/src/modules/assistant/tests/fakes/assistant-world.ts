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

export const inMemoryAssistantStore = () => {
  const conversations = new Map<string, Conversation>()
  const messages: StoredMessage[] = []
  const proposalRows = new Map<string, StoredProposal>()
  const store: AssistantStore = {
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
    project: { id: 'p1', name: 'Onboarding' },
  }
  const actionsLog: { action: string; input: unknown }[] = []
  let nextError: string | null = null
  const reads: ResearchReads = {
    getProject: async (accountId, id) => (accountId === 'ada' && id === 'p1' ? project : null),
    listStudies: async (accountId, id) =>
      accountId === 'ada' && id === 'p1'
        ? [{ id: 's1', name: study.name, type: 'interviews', folderName: 'Interviews Q4' }]
        : null,
    getStudy: async (accountId, id) => (accountId === 'ada' && id === 's1' ? study : null),
    teamsOf: async (accountId) => (accountId === 'ada' ? [{ id: 't1', name: 'Growth' }] : []),
    listProjects: async (accountId) =>
      accountId === 'ada' ? [{ id: 'p1', name: 'Onboarding', team: { name: 'Growth' } }] : [],
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
    createStudy: async (c) => result('createStudy', c, { id: 's-new' }),
    renameStudy: async (c) => result('renameStudy', c, {}),
  }
  return {
    reads,
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
  let script: StreamPart[] = [{ type: 'text', delta: 'Hello' }]
  let failure: Error | null = null
  const gateway: AssistantDeps['gateway'] = {
    stream: async (_accountId, _task, request) => {
      requests.push(request)
      const parts = script
      const fail = failure
      failure = null
      async function* generate(): AsyncGenerator<StreamPart> {
        for (const part of parts) yield part
        if (fail) throw fail
      }
      const done = Promise.resolve({ inputTokens: 1, outputTokens: 1 })
      return { parts: generate(), done }
    },
  }
  return {
    gateway,
    requests,
    answer: (parts: StreamPart[]) => {
      script = parts
    },
    failWith: (error: Error) => {
      failure = error
    },
  }
}

export const assistantWorld = () => {
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
