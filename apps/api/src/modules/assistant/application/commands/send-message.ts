import { err, ok, type Result } from '@goodresearch/shared'
import { AiProviderRequired, failureOf } from '../../../ai-gateway/index.ts'
import { selectHistory } from '../../domain/history.ts'
import { isNavigation, isProposalKind } from '../../domain/proposal.ts'
import { titleFrom } from '../../domain/title.ts'
import { buildContext } from '../context.ts'
import type {
  Actor,
  AiFailure,
  AssistantDeps,
  ChatMessage,
  PageRef,
  StoredMessage,
  StoredProposal,
} from '../ports.ts'
import { prepareProposal, TOOLS } from '../tools.ts'
import { proposalView } from '../views.ts'

const BUDGET = { maxMessages: 30, maxCharacters: 40_000 }

export type StreamEvent =
  | { type: 'start'; personMessageId: string; assistantMessageId: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; proposal: ReturnType<typeof proposalView> }
  | { type: 'done'; status: 'complete' | 'stopped' | 'failed' }
  | { type: 'error'; failure: AiFailure }

/** What the model is told about a proposal in the next turns (research R2). */
const outcomeOf = (p: StoredProposal): string => {
  switch (p.state) {
    case 'applied':
      return isNavigation(p.kind)
        ? 'The page is open for the person.'
        : `Applied by the person${p.resultId ? ` (id ${p.resultId})` : ''}.`
    case 'dismissed':
      return 'Dismissed by the person: do not propose it again unchanged.'
    case 'failed':
      return `The person tried to apply it and it failed: ${p.error ?? 'unknown error'}.`
    case 'invalid':
      return 'Not shown: the values were invalid or the object is out of reach. Check the context.'
    default:
      return 'Shown to the person, not decided yet.'
  }
}

/** The arguments of the original tool call, as the model sent them. */
const callInput = (p: StoredProposal): Record<string, unknown> => {
  if (p.state === 'invalid' || !p.targetId) return { ...p.values }
  const key = p.kind === 'rename_study' ? 'studyId' : 'projectId'
  return { ...p.values, [key]: p.targetId }
}

/**
 * Where a message was sent from, so the model always knows where the person was, even after they
 * moved between messages (spec 005 US2). Ids only: the current page's details are in the context.
 */
const whereFrom = (m: StoredMessage): string => {
  if (m.pageKind === 'project' && m.pageId) return `[Sent from the page of project id ${m.pageId}]`
  if (m.pageKind === 'study' && m.pageId) return `[Sent from the page of study id ${m.pageId}]`
  return `[Sent from the ${m.pageKind ?? 'unknown'} page]`
}

/** The conversation as the model sees it: messages, then its tool calls and their outcomes. */
const historyOf = (
  messages: readonly StoredMessage[],
  proposals: readonly StoredProposal[],
): ChatMessage[] =>
  selectHistory(
    messages.filter((m) => m.text.length > 0 || proposals.some((p) => p.messageId === m.id)),
    BUDGET,
  )
    // Providers expect the conversation to start with the person: drop a leading answer.
    .filter((m, i, kept) => i >= kept.findIndex((k) => k.role === 'person'))
    .flatMap((m): ChatMessage[] => {
      if (m.role === 'person') return [{ role: 'user', content: `${whereFrom(m)}\n${m.text}` }]
      const mine = proposals.filter((p) => p.messageId === m.id)
      if (mine.length === 0) return [{ role: 'assistant', content: m.text }]
      return [
        {
          role: 'assistant',
          content: m.text,
          toolCalls: mine.map((p) => ({ id: p.callId, name: p.kind, input: callInput(p) })),
        },
        {
          role: 'tool',
          results: mine.map((p) => ({ id: p.callId, name: p.kind, output: outcomeOf(p) })),
        },
      ]
    })

/**
 * Spec 005 US1–US3: stores the person's message, streams the answer with the page context and the
 * proposal tools, and stores everything; a stopped answer keeps its text.
 */
export const makeSendMessage = (deps: AssistantDeps) => {
  /** Checked before the stream starts, so errors are plain HTTP answers. */
  const open = async (c: {
    actor: Actor
    conversationId: string
  }): Promise<Result<true, 'CONVERSATION_NOT_FOUND'>> =>
    (await deps.store.getConversation(c.actor.id, c.conversationId))
      ? ok(true)
      : err('CONVERSATION_NOT_FOUND')

  async function* send(c: {
    actor: Actor
    conversationId: string
    text: string
    page: PageRef
    language: 'en' | 'fr'
  }): AsyncGenerator<StreamEvent> {
    const conversation = await deps.store.getConversation(c.actor.id, c.conversationId)
    if (!conversation) return
    const previous = await deps.store.listMessages(c.conversationId)
    const now = deps.clock.now()
    const person: StoredMessage = {
      id: deps.newId(),
      conversationId: c.conversationId,
      role: 'person',
      text: c.text.trim(),
      status: 'complete',
      failure: null,
      pageKind: c.page.kind,
      pageId: c.page.id ?? null,
      createdAt: now,
    }
    await deps.store.saveMessage(person)
    await deps.store.updateConversation(c.conversationId, {
      lastActivityAt: now,
      ...(previous.length === 0 ? { title: titleFrom(person.text) } : {}),
    })

    let answer: StoredMessage = {
      ...person,
      id: deps.newId(),
      role: 'assistant',
      text: '',
      status: 'streaming',
      createdAt: new Date(now.getTime() + 1),
    }
    await deps.store.saveMessage(answer)
    yield { type: 'start', personMessageId: person.id, assistantMessageId: answer.id }

    let text = ''
    let settled = false
    const finish = async (status: StoredMessage['status'], failure: AiFailure | null = null) => {
      settled = true
      answer = { ...answer, text, status, failure }
      await deps.store.saveMessage(answer)
      await deps.store.updateConversation(c.conversationId, { lastActivityAt: deps.clock.now() })
    }

    try {
      const proposals = await deps.store.listProposals(c.conversationId)
      const { system } = await buildContext(deps.research, c.actor, c.page, c.language)
      const { parts, done } = await deps.gateway.stream(
        c.actor.id,
        'assistant',
        {
          system,
          messages: historyOf([...previous, person], proposals),
          tools: TOOLS,
          maxOutputTokens: 4000,
        },
        // The calls of this answer, to show the conversation's cost (US6).
        { ref: answer.id },
      )
      for await (const part of parts) {
        if (part.type === 'text') {
          text += part.delta
          yield { type: 'text', delta: part.delta }
          continue
        }
        // A tool the app does not know is ignored (the model only sees its own tools).
        if (!isProposalKind(part.call.name)) continue
        const prepared = await prepareProposal(deps.research, c.actor, part.call)
        const raw = typeof part.call.input === 'object' && part.call.input ? part.call.input : {}
        const proposal: StoredProposal = {
          id: deps.newId(),
          callId: part.call.id,
          messageId: answer.id,
          kind: part.call.name,
          targetId: prepared?.targetId ?? null,
          targetVersion: prepared?.targetVersion ?? null,
          values: prepared?.values ?? (raw as Record<string, unknown>),
          preview: prepared?.preview ?? {},
          // Opening a page changes nothing: done at once, the browser follows (US5).
          ...(prepared && isNavigation(prepared.kind)
            ? {
                state: 'applied' as const,
                resultKind:
                  prepared.kind === 'open_study' ? ('study' as const) : ('project' as const),
                resultId: prepared.targetId,
                decidedAt: deps.clock.now(),
              }
            : {
                state: prepared ? ('proposed' as const) : ('invalid' as const),
                resultKind: null,
                resultId: null,
                decidedAt: null,
              }),
          error: null,
        }
        await deps.store.saveProposal(proposal)
        if (prepared) yield { type: 'proposal', proposal: proposalView(proposal) }
      }
      await done
      await finish('complete')
      yield { type: 'done', status: 'complete' }
    } catch (error) {
      const failure: AiFailure =
        error instanceof AiProviderRequired ? 'INVALID_CREDENTIAL' : failureOf(error)
      await finish('failed', failure)
      yield { type: 'error', failure }
      yield { type: 'done', status: 'failed' }
    } finally {
      // The person stopped the answer or went away: keep what was written.
      if (!settled) await finish('stopped')
    }
  }

  return { open, send }
}

export type SendMessage = ReturnType<typeof makeSendMessage>
