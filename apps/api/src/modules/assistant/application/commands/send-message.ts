import { err, ok, type Result } from '@goodresearch/shared'
import { AiProviderRequired, failureOf } from '../../../ai-gateway/index.ts'
import { completeness, type GuidePoint } from '../../domain/guide-progress.ts'
import { selectHistory } from '../../domain/history.ts'
import {
  currentFraming,
  type FramingPoint,
  framingCompleteness,
} from '../../domain/project-framing.ts'
import {
  isNavigation,
  isProposalKind,
  isRecordedAtOnce,
  isRunDuringAnswer,
  isStudyChange,
  type ProposalKind,
} from '../../domain/proposal.ts'
import {
  currentStudyFraming,
  type StudyFramingPoint,
  studyFramingCompleteness,
} from '../../domain/study-framing.ts'
import { titleFrom } from '../../domain/title.ts'
import { buildContext, type Continuation, type GuideStudy, reusableStudies } from '../context.ts'
import type {
  Actor,
  AiFailure,
  AssistantDeps,
  ChatMessage,
  PageRef,
  ProposalPreview,
  StoredMessage,
  StoredProposal,
  ToolSpec,
} from '../ports.ts'
import { SKILLS } from '../skills.ts'
import {
  checksOf,
  GUIDE_TOOLS,
  prepareDeletion,
  prepareFolder,
  prepareProject,
  prepareProposal,
  prepareStudy,
  prepareStudyChange,
  TOOL_INPUTS,
  TOOLS,
} from '../tools.ts'
import { proposalView } from '../views.ts'

const BUDGET = { maxMessages: 30, maxCharacters: 40_000 }

export type StreamEvent =
  | { type: 'start'; personMessageId?: string; assistantMessageId: string }
  | { type: 'text'; delta: string }
  | { type: 'proposal'; proposal: ReturnType<typeof proposalView> }
  | { type: 'done'; status: 'complete' | 'stopped' | 'failed' }
  | { type: 'error'; failure: AiFailure }

/** What the writing rules found, as the model reads it (spec 006). */
const checksText = (checks: ProposalPreview['checks'] = []): string =>
  checks
    .map(
      (c, i) =>
        `${i + 1}. ${c.issues.length ? `to review (${c.issues.join(', ')})` : 'ok'}: ${c.question}`,
    )
    .join('\n') || 'Nothing to check.'

type NewCard = 'create_project' | 'create_study' | 'attach_folder'

const CHOICES_SHOWN = 'List shown to the person: their next message answers it.'

const CONNECTION_SHOWN =
  'Not connected: a card asks the person to connect their file source, and the conversation goes on at their return. Add nothing.'

const CARD_SHOWN = 'Card shown to the person. Wait for their decision and add nothing.'

/** What the answer goes on from, when it follows no message; the last answer's card says. */
const continuationOf = (held: readonly StoredProposal[]): Continuation => {
  const has = (kind: ProposalKind) => held.some((p) => p.kind === kind && p.state === 'applied')
  if (has('attach_folder')) return 'folder'
  if (has('create_study')) return 'study'
  return has('create_project') ? 'project' : 'connected'
}

const NOT_CONTINUING = [
  'create_project',
  'report_project_progress',
  'create_study',
  'report_study_progress',
  'load_skill',
]

/** Marks a project or study card dismissed because a newer one replaced it, not by the person. */
const REPLACED = 'REPLACED'

/** What the model is told about a tool call in the next turns (research R2). */
const outcomeOf = (p: StoredProposal): string => {
  if (p.kind === 'connect_source' && p.state === 'applied')
    return 'The person connected their file source: call attach_folder again.'
  if (p.kind === 'connect_source' && p.state === 'proposed')
    return 'Not connected: a card asks the person to connect their file source.'
  if (p.state === 'applied' && p.kind === 'offer_choices') return CHOICES_SHOWN
  if (p.state === 'applied' && p.kind === 'load_skill')
    return 'Loaded: its instructions are in your context.'
  if (p.state === 'applied' && p.kind === 'check_guide_questions')
    return checksText(p.preview.checks)
  if (p.state === 'applied' && isRecordedAtOnce(p.kind))
    return `Recorded: ${p.preview.progress?.percent ?? 0} % covered.`
  switch (p.state) {
    case 'applied':
      return isNavigation(p.kind)
        ? 'The page is open for the person.'
        : `Applied by the person${p.resultId ? ` (id ${p.resultId})` : ''}.`
    case 'dismissed':
      if (p.error === REPLACED) return 'Replaced by your newer card.'
      return 'Dismissed by the person: do not propose it again unchanged.'
    case 'failed':
      return `The person tried to apply it and it failed: ${p.error ?? 'unknown error'}.`
    case 'invalid':
      return (
        p.error ??
        'Not shown: the values were invalid or the object is out of reach. Check the context.'
      )
    default:
      return 'Shown to the person, not decided yet.'
  }
}

/** Spec 022: a connection card comes from the call of a tool the model does have. */
const toolOf = (p: StoredProposal): string =>
  p.kind === 'connect_source' ? 'attach_folder' : p.kind

/** The arguments of the original tool call, as the model sent them. */
const callInput = (p: StoredProposal): Record<string, unknown> => {
  // A framed project: what the model sent, without the goal the app composed from it (spec 018).
  if (p.kind === 'create_project' && 'question' in p.values) {
    const { goal: _composed, ...sent } = p.values
    return sent
  }
  if (p.state === 'invalid' || !p.targetId) return { ...p.values }
  const key =
    p.kind === 'rename_study' ||
    p.kind === 'open_study' ||
    p.kind === 'propose_interview_guide' ||
    p.kind === 'attach_folder' ||
    p.kind === 'connect_source' ||
    isStudyChange(p.kind)
      ? 'studyId'
      : 'projectId'
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
          toolCalls: mine.map((p) => ({ id: p.callId, name: toolOf(p), input: callInput(p) })),
        },
        {
          role: 'tool',
          results: mine.map((p) => ({ id: p.callId, name: toolOf(p), output: outcomeOf(p) })),
        },
      ]
    })

/**
 * Spec 005 US1–US3: stores the person's message, streams the answer with the page context and the
 * proposal tools, and stores everything; a stopped answer keeps its text. Spec 018 US3: `continue`
 * streams the answer that follows an applied project, without a message from the person.
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

  /** Only right after the answer holding the applied project; a second call finds a later one. */
  const openContinue = async (c: {
    actor: Actor
    conversationId: string
    page?: PageRef
  }): Promise<Result<true, 'CONVERSATION_NOT_FOUND' | 'NOTHING_TO_CONTINUE'>> => {
    const opened = await open(c)
    if (!opened.ok) return opened
    const last = (await deps.store.listMessages(c.conversationId)).at(-1)
    // Stopped or failed after its card was shown, the answer can still have been applied.
    if (last?.role !== 'assistant' || last.status === 'streaming') return err('NOTHING_TO_CONTINUE')
    const held = (await deps.store.listProposals(c.conversationId)).filter(
      (p) => p.messageId === last.id,
    )
    const applied =
      held.some(
        (p) =>
          (p.kind === 'create_project' ||
            p.kind === 'create_study' ||
            p.kind === 'attach_folder') &&
          p.state === 'applied',
      ) ||
      // Spec 022: the address only says the consent went well; the connection proves it.
      (held.some(
        // The card's own study: a consent given from another one must not bring its link there.
        (p) => p.kind === 'connect_source' && p.state === 'proposed' && p.targetId === c.page?.id,
      ) &&
        (await deps.research.sourceConnected(c.actor.id)))
    return applied ? ok(true) : err('NOTHING_TO_CONTINUE')
  }

  async function* send(c: {
    actor: Actor
    conversationId: string
    /** Absent when the answer continues after an applied project. */
    text?: string
    page: PageRef
    language: 'en' | 'fr'
  }): AsyncGenerator<StreamEvent> {
    const conversation = await deps.store.getConversation(c.actor.id, c.conversationId)
    if (!conversation) return
    const previous = await deps.store.listMessages(c.conversationId)
    const now = deps.clock.now()
    const person: StoredMessage | null =
      c.text === undefined
        ? null
        : {
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
    if (person) {
      await deps.store.saveMessage(person)
      await deps.store.updateConversation(c.conversationId, {
        lastActivityAt: now,
        ...(previous.length === 0 ? { title: titleFrom(person.text) } : {}),
      })
    }

    let answer: StoredMessage = {
      id: deps.newId(),
      conversationId: c.conversationId,
      role: 'assistant',
      text: '',
      status: 'streaming',
      failure: null,
      pageKind: c.page.kind,
      pageId: c.page.id ?? null,
      createdAt: new Date(now.getTime() + 1),
    }
    await deps.store.saveMessage(answer)
    yield {
      type: 'start',
      ...(person ? { personMessageId: person.id } : {}),
      assistantMessageId: answer.id,
    }

    let text = ''
    let settled = false
    const finish = async (status: StoredMessage['status'], failure: AiFailure | null = null) => {
      settled = true
      answer = { ...answer, text, status, failure }
      await deps.store.saveMessage(answer)
      await deps.store.updateConversation(c.conversationId, { lastActivityAt: deps.clock.now() })
    }

    // Tool calls the app runs during the answer: recorded, then shown once the stream yields.
    const pending: StreamEvent[] = []
    const record = async (
      callId: string,
      kind: ProposalKind,
      values: Record<string, unknown>,
      preview: ProposalPreview | null,
      refused: string | null = null,
    ) => {
      const proposal: StoredProposal = {
        id: deps.newId(),
        callId,
        messageId: answer.id,
        kind,
        targetId: null,
        targetVersion: null,
        values,
        preview: preview ?? {},
        state: preview ? 'applied' : 'invalid',
        resultKind: null,
        resultId: null,
        error: refused,
        decidedAt: deps.clock.now(),
      }
      await deps.store.saveProposal(proposal)
      if (preview) pending.push({ type: 'proposal', proposal: proposalView(proposal) })
    }

    /** A new project or study (spec 018, 021): a card replacing the open one, or the reason of a refusal. */
    // One at a time: calls of one step run together, and each must see the card before it.
    let proposing: Promise<unknown> = Promise.resolve()
    const proposeNew = (kind: NewCard, input: unknown, callId: string): Promise<string> => {
      const next = proposing.then(() => proposeOne(kind, input, callId))
      proposing = next.catch(() => undefined)
      return next
    }
    const proposeOne = async (kind: NewCard, input: unknown, callId: string): Promise<string> => {
      const proposals = await deps.store.listProposals(c.conversationId)
      const prepared =
        kind === 'attach_folder'
          ? await prepareFolder(deps.research, c.actor, input)
          : kind === 'create_study'
            ? await prepareStudy(deps.research, c.actor, input, currentStudyFraming(proposals))
            : await prepareProject(
                deps.research,
                c.actor,
                input,
                currentFraming(proposals),
                c.language,
              )
      if ('refused' in prepared) {
        const raw = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>
        await record(callId, kind, raw, null, prepared.refused)
        return prepared.refused
      }
      for (const open of proposals)
        if (
          (open.kind === kind || (kind === 'attach_folder' && open.kind === 'connect_source')) &&
          open.state === 'proposed' &&
          // A folder's card only gives way to another card for the same study.
          (kind !== 'attach_folder' || open.targetId === prepared.targetId)
        )
          await deps.store.transitionProposal(open.id, 'proposed', {
            ...open,
            state: 'dismissed',
            error: REPLACED,
            decidedAt: deps.clock.now(),
          })
      const proposal: StoredProposal = {
        id: deps.newId(),
        callId,
        messageId: answer.id,
        ...prepared,
        state: 'proposed',
        resultKind: null,
        resultId: null,
        error: null,
        decidedAt: null,
      }
      await deps.store.saveProposal(proposal)
      pending.push({ type: 'proposal', proposal: proposalView(proposal) })
      return prepared.kind === 'connect_source' ? CONNECTION_SHOWN : CARD_SHOWN
    }

    /** A change of a study's links or goal (spec 019): a card, or the reason of a refusal. */
    const proposeStudyChange = async (
      name: string,
      input: unknown,
      callId: string,
    ): Promise<string> => {
      const prepared =
        name === 'delete_project'
          ? await prepareDeletion(deps.research, c.actor, input)
          : await prepareStudyChange(deps.research, c.actor, { name, input })
      if ('refused' in prepared) {
        const raw = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>
        await record(callId, name as ProposalKind, raw, null, prepared.refused)
        return prepared.refused
      }
      const proposal: StoredProposal = {
        id: deps.newId(),
        callId,
        messageId: answer.id,
        ...prepared,
        state: 'proposed',
        resultKind: null,
        resultId: null,
        error: null,
        decidedAt: null,
      }
      await deps.store.saveProposal(proposal)
      pending.push({ type: 'proposal', proposal: proposalView(proposal) })
      return name === 'delete_project'
        ? "Card shown to the person, who must type the project's name on it. Wait for their decision and add nothing."
        : CARD_SHOWN
    }

    /** The tools that run at once (spec 006, 018): skill, writing checks, progress, new project. */
    const runFor =
      (guideStudy: GuideStudy | null) =>
      async (name: string, input: unknown, callId: string): Promise<string> => {
        const raw = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>
        if (name === 'create_project' || name === 'create_study' || name === 'attach_folder')
          return proposeNew(name, input, callId)
        if (isStudyChange(name as ProposalKind) || name === 'delete_project')
          return proposeStudyChange(name, input, callId)
        if (name === 'report_project_progress') {
          const parsed = TOOL_INPUTS.report_project_progress.safeParse(input)
          if (!parsed.success) {
            await record(callId, 'report_project_progress', raw, null)
            return 'Invalid: use missing, partial or done for every point.'
          }
          const progress = framingCompleteness(parsed.data as Partial<Record<FramingPoint, string>>)
          await record(callId, 'report_project_progress', parsed.data, { progress })
          return `Recorded: ${progress.percent} % covered.`
        }
        if (name === 'offer_choices') {
          const parsed = TOOL_INPUTS.offer_choices.safeParse(input)
          if (!parsed.success) {
            const reason =
              'Not shown: send a question and 2 to 6 different choices of at most 120 characters.'
            await record(callId, 'offer_choices', raw, null, reason)
            return reason
          }
          await record(callId, 'offer_choices', parsed.data, parsed.data)
          return CHOICES_SHOWN
        }
        if (name === 'report_study_progress') {
          const parsed = TOOL_INPUTS.report_study_progress.safeParse(input)
          if (!parsed.success) {
            await record(callId, 'report_study_progress', raw, null)
            return 'Invalid: use missing, partial or done for every point.'
          }
          const progress = studyFramingCompleteness(
            parsed.data as Partial<Record<StudyFramingPoint, string>>,
          )
          await record(callId, 'report_study_progress', parsed.data, { progress })
          return `Recorded: ${progress.percent} % covered.`
        }
        if (name === 'load_skill') {
          const parsed = TOOL_INPUTS.load_skill.safeParse(input)
          // The guide design and its tools only exist on an interview study (spec 006).
          if (!parsed.success || (parsed.data.name === 'interview-guide-design' && !guideStudy)) {
            await record(callId, 'load_skill', raw, null)
            return 'Unknown skill: use a name listed in the context.'
          }
          const skill = parsed.data.name as keyof typeof SKILLS
          await record(callId, 'load_skill', parsed.data, { skill })
          // Spec 021: the studies to compare arrive with the method, and stay in the context.
          return skill === 'study-framing'
            ? `${SKILLS[skill].instructions}\n\n${await reusableStudies(deps.research, c.actor, c.page)}`
            : SKILLS[skill].instructions
        }
        if (name === 'check_guide_questions') {
          const parsed = TOOL_INPUTS.check_guide_questions.safeParse(input)
          if (!parsed.success) {
            await record(callId, 'check_guide_questions', raw, null)
            return 'Invalid: send 1 to 60 questions of at most 600 characters.'
          }
          const checks = checksOf(parsed.data.questions)
          await record(callId, 'check_guide_questions', parsed.data, { checks })
          return checksText(checks)
        }
        const parsed = TOOL_INPUTS.report_guide_progress.safeParse(input)
        if (!parsed.success || !guideStudy || parsed.data.studyId !== guideStudy.id) {
          await record(callId, 'report_guide_progress', raw, null)
          return 'Invalid: use the Study id of the context, and missing, partial or done for every point.'
        }
        const progress = completeness(parsed.data as Partial<Record<GuidePoint, string>>)
        await record(callId, 'report_guide_progress', parsed.data, {
          studyName: guideStudy.name,
          progress,
        })
        return `Recorded: ${progress.percent} % covered.`
      }

    try {
      const before = await deps.store.listProposals(c.conversationId)
      const held = before.filter((p) => p.messageId === previous.at(-1)?.id)
      const continuation = person ? null : continuationOf(held)
      // Spec 022: the consent decides the connection card, checked in openContinue.
      if (continuation === 'connected')
        for (const p of held)
          if (p.kind === 'connect_source' && p.state === 'proposed')
            await deps.store.transitionProposal(p.id, 'proposed', {
              ...p,
              state: 'applied',
              decidedAt: deps.clock.now(),
            })
      const proposals = await deps.store.listProposals(c.conversationId)
      const loadedSkills = proposals
        .filter((p) => p.kind === 'load_skill' && p.state === 'applied')
        .map((p) => String(p.values.name))
      const { system, guideStudy } = await buildContext(
        deps.research,
        c.actor,
        c.page,
        c.language,
        loadedSkills,
        continuation,
      )
      const run = runFor(guideStudy)
      // A continuing answer follows a card just applied: it offers the next step, no new card.
      const offered = [...TOOLS, ...(guideStudy && person ? GUIDE_TOOLS : [])].filter(
        (t) =>
          person ||
          (!NOT_CONTINUING.includes(t.name) &&
            (continuation === 'connected' || t.name !== 'attach_folder')),
      )
      const tools: ToolSpec[] = offered.map((t) =>
        isRunDuringAnswer(t.name as ProposalKind)
          ? {
              ...t,
              run: (input: unknown, call: { id: string }) => run(t.name, input, call.id),
            }
          : t,
      )
      const { parts, done } = await deps.gateway.stream(
        c.actor.id,
        'assistant',
        {
          system,
          messages: historyOf(person ? [...previous, person] : previous, proposals),
          tools,
          maxOutputTokens: 4000,
        },
        // The calls of this answer, to show the conversation's cost (US6).
        { ref: answer.id },
      )
      for await (const part of parts) {
        yield* pending.splice(0)
        if (part.type === 'text') {
          text += part.delta
          yield { type: 'text', delta: part.delta }
          continue
        }
        // A tool the app does not know is ignored (the model only sees its own tools).
        if (!isProposalKind(part.call.name)) continue
        // Run (and recorded) by the app during the answer.
        if (isRunDuringAnswer(part.call.name)) continue
        if (isRecordedAtOnce(part.call.name)) {
          await run(part.call.name, part.call.input, part.call.id)
          yield* pending.splice(0)
          continue
        }
        const prepared = await prepareProposal(deps.research, c.actor, part.call, guideStudy)
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
      yield* pending.splice(0)
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

  return { open, openContinue, send }
}

export type SendMessage = ReturnType<typeof makeSendMessage>
