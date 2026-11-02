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
  isActivity,
  isInterviewCard,
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
  folderWorkRefusal,
  GUIDE_TOOLS,
  prepareAnalysis,
  prepareDeletion,
  prepareFolder,
  prepareFolderChanges,
  prepareInterviewCard,
  prepareProject,
  prepareProposal,
  preparePublication,
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

type NewCard =
  | 'create_project'
  | 'create_study'
  | 'attach_folder'
  | 'publish_preparation'
  | 'propose_folder_changes'
  | 'propose_analysis'
  | 'propose_accepting_suggestions'
  | 'propose_validating_interviews'
  | 'propose_excluding_interviews'

const NOTHING_WRITTEN = {
  en: 'I could not finish what you asked: nothing came of my attempt. You can try again, or tell me more.',
  fr: 'Je n’ai pas réussi à aller au bout de votre demande : ma tentative n’a rien donné. Vous pouvez réessayer, ou me donner plus de précisions.',
} as const

const TOOL_FAILED =
  'This tool failed for a technical reason of the app. Say so in a few words, and offer to try again.'

const CHOICES_SHOWN = 'List shown to the person: their next message answers it.'

const CONNECTION_SHOWN =
  'Not connected: a card asks the person to connect their file source, and the conversation goes on at their return. Add nothing.'

const CARD_SHOWN = 'Card shown to the person. Wait for their decision and add nothing.'

/** What the answer goes on from, when it follows no message; the last answer's card says. */
const continuationOf = (held: readonly StoredProposal[]): Continuation => {
  const has = (kind: ProposalKind) => held.some((p) => p.kind === kind && p.state === 'applied')
  if (has('folder_consent')) return 'consented'
  if (has('propose_analysis')) return 'analysed'
  if (held.some((p) => isInterviewCard(p.kind) && p.state === 'applied')) return 'decided'
  if (has('propose_folder_changes')) return 'tidied'
  if (has('attach_folder')) return 'folder'
  if (has('publish_preparation')) return 'published'
  if (has('propose_interview_guide')) return 'guide'
  if (has('create_study')) return 'study'
  return has('create_project') ? 'project' : 'connected'
}

/** Spec 024: extracts sent to the provider in one answer. */
const MAX_READS = 5

const FOLDER_CARDS = [
  'attach_folder',
  'publish_preparation',
  'browse_folder',
  'find_files',
  'read_file',
  'list_interviews',
  'propose_folder_changes',
  'propose_analysis',
  'propose_accepting_suggestions',
  'propose_validating_interviews',
  'propose_excluding_interviews',
]

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
  if (
    p.kind === 'browse_folder' ||
    p.kind === 'find_files' ||
    p.kind === 'read_file' ||
    p.kind === 'count_interviews' ||
    p.kind === 'list_interviews'
  )
    return p.state === 'applied'
      ? 'Done then. Its result is not kept: call it again if you need it.'
      : (p.error ?? 'Not done.')
  if (p.kind === 'folder_consent' && p.state === 'applied')
    return 'The person agreed: call the same tool again.'
  if (p.kind === 'folder_consent' && p.state === 'proposed')
    return 'Not allowed yet: a card asks for the consent of the person.'
  if (p.kind === 'folder_consent' && p.state === 'dismissed')
    return 'The person refused: only counts are available, unless they ask again.'
  if (isInterviewCard(p.kind) && p.state === 'applied')
    return `Applied by the person. Outcome of each line: ${(p.preview.interviewLines ?? [])
      .map((l) => `${l.interview}${l.field ? ` (${l.field})` : ''}: ${l.outcome ?? 'unknown'}`)
      .join('; ')}.`
  if (p.kind === 'propose_folder_changes' && p.state === 'applied')
    return `Applied by the person. Outcome of each line: ${(p.preview.lines ?? [])
      .map((l) => `${l.after}: ${l.outcome ?? 'unknown'}`)
      .join('; ')}. Do not repeat file names you did not need.`
  if (p.kind === 'connect_source' && p.state === 'applied')
    return 'The person connected their file source: call the same tool again.'
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
const toolOf = (p: StoredProposal): string => {
  if (p.kind === 'folder_consent') return String(p.values.tool)
  if (p.kind !== 'connect_source') return p.kind
  if ('lines' in p.values) return 'propose_folder_changes'
  return 'kinds' in p.values ? 'publish_preparation' : 'attach_folder'
}

/** The arguments of the original tool call, as the model sent them. */
const callInput = (p: StoredProposal): Record<string, unknown> => {
  // A consent card comes from the call that needed it.
  if (p.kind === 'folder_consent') return (p.values.input ?? {}) as Record<string, unknown>
  // A framed project: what the model sent, without the goal the app composed from it (spec 018).
  if (p.kind === 'create_project' && 'question' in p.values) {
    const { goal: _composed, ...sent } = p.values
    return sent
  }
  if (p.state === 'invalid' || !p.targetId) return { ...p.values }
  // The app built the lines, names included: only the interviews asked for go back to the model.
  if (isInterviewCard(p.kind))
    return {
      studyId: p.targetId,
      items: [...new Set((p.preview.interviewLines ?? []).map((l) => l.interviewId))].map(
        (interviewId) => ({ interviewId }),
      ),
    }
  const key =
    p.kind === 'rename_study' ||
    p.kind === 'open_study' ||
    p.kind === 'propose_interview_guide' ||
    p.kind === 'attach_folder' ||
    p.kind === 'publish_preparation' ||
    p.kind === 'propose_folder_changes' ||
    p.kind === 'propose_analysis' ||
    isInterviewCard(p.kind) ||
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
    // The card's own study: a consent given from another one must not bring its link there.
    const card = held.find(
      (p) => p.kind === 'connect_source' && p.state === 'proposed' && p.targetId === c.page?.id,
    )
    const applied =
      held.some(
        (p) =>
          (p.kind === 'create_project' ||
            p.kind === 'create_study' ||
            p.kind === 'attach_folder' ||
            p.kind === 'publish_preparation' ||
            p.kind === 'propose_interview_guide' ||
            p.kind === 'propose_folder_changes' ||
            p.kind === 'folder_consent' ||
            p.kind === 'propose_analysis' ||
            isInterviewCard(p.kind)) &&
          p.state === 'applied',
      ) ||
      // Spec 022: the address only says the consent went well; the connection proves it.
      (card !== undefined &&
        (await deps.research.sourceConnected(c.actor.id, card.preview.access ?? 'read')))
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
        kind === 'propose_accepting_suggestions' ||
        kind === 'propose_validating_interviews' ||
        kind === 'propose_excluding_interviews'
          ? await prepareInterviewCard(deps.research, c.actor, kind, input)
          : kind === 'propose_analysis'
            ? await prepareAnalysis(deps.research, c.actor, input)
            : kind === 'propose_folder_changes'
              ? await prepareFolderChanges(deps.research, c.actor, input)
              : kind === 'publish_preparation'
                ? await preparePublication(deps.research, c.actor, input, c.language)
                : kind === 'attach_folder'
                  ? await prepareFolder(deps.research, c.actor, input)
                  : kind === 'create_study'
                    ? await prepareStudy(
                        deps.research,
                        c.actor,
                        input,
                        currentStudyFraming(proposals),
                      )
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
          (open.kind === kind ||
            ((kind === 'attach_folder' ||
              kind === 'publish_preparation' ||
              kind === 'propose_folder_changes') &&
              open.kind === 'connect_source')) &&
          open.state === 'proposed' &&
          // A card about a study only gives way to another card for the same study.
          ((kind !== 'attach_folder' &&
            kind !== 'publish_preparation' &&
            kind !== 'propose_folder_changes' &&
            kind !== 'propose_analysis' &&
            !isInterviewCard(kind)) ||
            open.targetId === prepared.targetId)
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

    /**
     * Spec 024: names and content reach the provider only after the person's consent for this
     * study and this provider; until then, a card, and nothing is read. Null once allowed.
     */
    const askFolderConsent = async (
      tool: string,
      input: unknown,
      callId: string,
    ): Promise<string | null> => {
      const studyId = (input as { studyId?: unknown } | null)?.studyId
      const study =
        typeof studyId === 'string' ? await deps.research.getStudy(c.actor.id, studyId) : null
      if (!study) {
        const reason = folderWorkRefusal('STUDY_NOT_FOUND')
        await record(callId, tool as ProposalKind, {}, null, reason)
        return reason
      }
      // Nobody is asked to agree to what cannot happen: anonymised study, no folder, no access.
      const available = await deps.research.folderWorkAvailable(c.actor, study.id)
      if (!available.ok) {
        const reason = folderWorkRefusal(available.error)
        await record(callId, tool as ProposalKind, {}, null, reason)
        return reason
      }
      const provider = await deps.research.aiProvider(c.actor.id)
      if (provider && (await deps.store.hasFolderConsent(c.actor.id, study.id, provider)))
        return null
      const proposal: StoredProposal = {
        id: deps.newId(),
        callId,
        messageId: answer.id,
        kind: 'folder_consent',
        targetId: study.id,
        targetVersion: null,
        values: { tool, input: input as object },
        preview: { studyId: study.id, studyName: study.name, provider: provider ?? '' },
        state: 'proposed',
        resultKind: null,
        resultId: null,
        error: null,
        decidedAt: null,
      }
      await deps.store.saveProposal(proposal)
      pending.push({ type: 'proposal', proposal: proposalView(proposal) })
      return 'Not allowed yet: a card asks for the consent of the person, and the conversation goes on after. Add nothing.'
    }

    /** Spec 024: the whole tree comes in one call; opening it again would only loop. */
    const treesGiven = new Set<string>()
    const browse = async (input: unknown, callId: string): Promise<string> => {
      const parsed = TOOL_INPUTS.browse_folder.safeParse(input)
      if (!parsed.success) return 'Refused: send a studyId, and a folderId for a sub-folder.'
      if (treesGiven.has(parsed.data.studyId))
        return 'You already have the whole folder, sub-folders included, in this answer. Use it, and write your answer.'
      const { studyId, folderId } = parsed.data
      const found = await deps.research.browseFolder(c.actor, studyId, folderId)
      if (!found.ok) {
        const reason = folderWorkRefusal(found.error)
        await record(callId, 'browse_folder', parsed.data, null, reason)
        return reason
      }
      await record(callId, 'browse_folder', parsed.data, { studyId })
      if (!folderId && !found.cut) treesGiven.add(studyId)
      return JSON.stringify({ items: found.items, cut: found.cut })
    }

    const listInterviews = async (input: unknown, callId: string): Promise<string> => {
      const parsed = TOOL_INPUTS.list_interviews.safeParse(input)
      if (!parsed.success)
        return 'Refused: send a studyId, and only known filters: to-decide, no-transcript, no-recording, not-analysed, ready, validated, excluded.'
      const { studyId, filters, name, page } = parsed.data
      const found = await deps.research.listInterviews(c.actor, studyId, { filters, name, page })
      if (!found.ok) {
        const reason = folderWorkRefusal(found.error)
        await record(callId, 'list_interviews', parsed.data, null, reason)
        return reason
      }
      await record(callId, 'list_interviews', parsed.data, { studyId })
      return JSON.stringify(found.page)
    }

    const find = async (input: unknown, callId: string): Promise<string> => {
      const parsed = TOOL_INPUTS.find_files.safeParse(input)
      if (!parsed.success) return 'Refused: send a studyId, and a query or a kind.'
      const { studyId, query, kind } = parsed.data
      const found = await deps.research.findFiles(c.actor, studyId, { query, kind })
      if (!found.ok) {
        const reason = folderWorkRefusal(found.error)
        await record(callId, 'find_files', parsed.data, null, reason)
        return reason
      }
      await record(callId, 'find_files', parsed.data, { studyId })
      return JSON.stringify({ items: found.items, cut: found.cut })
    }

    let reads = 0
    const read = async (input: unknown, callId: string): Promise<string> => {
      const parsed = TOOL_INPUTS.read_file.safeParse(input)
      if (!parsed.success) return 'Refused: send a studyId and a fileId.'
      reads++
      if (reads > MAX_READS) {
        const reason = `Refused: at most ${MAX_READS} reads per answer. Go on in the next answer.`
        await record(callId, 'read_file', parsed.data, null, reason)
        return reason
      }
      const { studyId, fileId, part } = parsed.data
      const found = await deps.research.readFile(c.actor, studyId, fileId, part)
      if (!found.ok) {
        const reason = folderWorkRefusal(found.error)
        await record(callId, 'read_file', parsed.data, null, reason)
        return reason
      }
      await record(callId, 'read_file', parsed.data, { studyId, fileName: found.name })
      return JSON.stringify({ text: found.text, more: found.more })
    }

    /** The tools that run at once (spec 006, 018): skill, writing checks, progress, new project. */
    const runFor =
      (guideStudy: GuideStudy | null) =>
      async (name: string, input: unknown, callId: string): Promise<string> => {
        const raw = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>
        if (
          name === 'create_project' ||
          name === 'create_study' ||
          name === 'attach_folder' ||
          name === 'publish_preparation' ||
          name === 'propose_analysis'
        )
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
        if (
          name === 'browse_folder' ||
          name === 'find_files' ||
          name === 'read_file' ||
          name === 'list_interviews' ||
          name === 'propose_accepting_suggestions' ||
          name === 'propose_validating_interviews' ||
          name === 'propose_excluding_interviews' ||
          name === 'propose_folder_changes'
        ) {
          const consent = await askFolderConsent(name, input, callId)
          if (consent) return consent
          if (name === 'propose_folder_changes' || isInterviewCard(name as ProposalKind))
            return proposeNew(name as NewCard, input, callId)
          if (name === 'browse_folder') return browse(input, callId)
          if (name === 'find_files') return find(input, callId)
          if (name === 'list_interviews') return listInterviews(input, callId)
          return read(input, callId)
        }
        if (name === 'count_interviews') {
          const parsed = TOOL_INPUTS.count_interviews.safeParse(input)
          if (!parsed.success) return 'Refused: send a studyId.'
          const study = await deps.research.getStudy(c.actor.id, parsed.data.studyId)
          const found = study
            ? await deps.research.interviewCounts(c.actor, study.id)
            : ({ ok: false, error: 'STUDY_NOT_FOUND' } as const)
          if (!found.ok) {
            const reason = folderWorkRefusal(found.error)
            await record(callId, 'count_interviews', parsed.data, null, reason)
            return reason
          }
          await record(callId, 'count_interviews', parsed.data, { studyId: parsed.data.studyId })
          return JSON.stringify(found.counts)
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
            (continuation === 'connected' ||
              continuation === 'consented' ||
              !FOLDER_CARDS.includes(t.name))),
      )
      const tools: ToolSpec[] = offered.map((t) =>
        isRunDuringAnswer(t.name as ProposalKind)
          ? {
              ...t,
              run: async (input: unknown, call: { id: string }) => {
                try {
                  return await run(t.name, input, call.id)
                } catch (error) {
                  // Told to the model, which would otherwise guess; kept for whoever investigates.
                  deps.log.warn({ err: error, tool: t.name }, 'assistant tool failed')
                  return TOOL_FAILED
                }
              },
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
      // Spec 024: a model can end on a tool without a word; the person must not be left guessing.
      if (!text.trim()) {
        const shown = (await deps.store.listProposals(c.conversationId)).some(
          (p) => p.messageId === answer.id && p.state !== 'invalid' && !isActivity(p.kind),
        )
        if (!shown) {
          text = NOTHING_WRITTEN[c.language]
          yield { type: 'text', delta: text }
        }
      }
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
