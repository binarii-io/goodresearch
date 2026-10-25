import {
  type AiFailure,
  type AssistantMessage,
  getConversation,
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  type Proposal,
  useCreateConversation,
  useDeleteConversation,
  useGetConversation,
  useGetProject,
  useGetStudy,
  useListConversations,
  useRenameConversation,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@goodresearch/ui/components/alert-dialog'
import { Button } from '@goodresearch/ui/components/button'
import {
  HistoryIcon,
  SendIcon,
  SquareIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { InlineEdit } from '@goodresearch/ui/components/inline-edit'
import { SegmentedProgress } from '@goodresearch/ui/components/segmented-progress'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { normalise } from '../../app/i18n.ts'
import { FailureNotice } from '../ai/provider-forms.tsx'
import { GUIDE_POINTS, POINT_STATES } from '../preparation/labels.ts'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { ConversationCostIndicator } from './cost.tsx'
import { Markdown } from './markdown.tsx'
import { usePageRef } from './page-ref.ts'
import { ProposalCard } from './proposal-card.tsx'
import { useAssistant } from './state.tsx'
import { sendAssistantMessage } from './stream.ts'

/** Failures only the person can fix: link to the AI provider page (spec 004). */
const NEEDS_PERSON: readonly AiFailure[] = [
  'INVALID_CREDENTIAL',
  'PERMISSION_DENIED',
  'API_DISABLED',
  'NO_CREDIT_OR_QUOTA',
]

/** An answer being written, before it is stored and reloaded with the conversation. */
type Live = {
  personText: string
  text: string
  proposals: Proposal[]
  failure: AiFailure | null
  /** Stored messages shown while answering: the new ones are shown from `live` (no duplicates). */
  shownBefore: number
}

function LookingAt() {
  const { t } = useLingui()
  const page = usePageRef()
  const project = useGetProject(page.id ?? '', {
    query: { enabled: page.kind === 'project' && Boolean(page.id) },
  })
  const study = useGetStudy(page.id ?? '', {
    query: { enabled: page.kind === 'study' && Boolean(page.id) },
  })
  const name =
    page.kind === 'project'
      ? project.data?.name
      : page.kind === 'study'
        ? study.data?.name
        : undefined
  const label =
    page.kind === 'project' && name
      ? t`Looking at: project ${name}`
      : page.kind === 'study' && name
        ? t`Looking at: study ${name}`
        : t`Looking at: this page`
  return <p className="truncate text-muted-foreground text-xs">{label}</p>
}

function Message({ message }: { message: AssistantMessage }) {
  const { t } = useLingui()
  if (message.role === 'person')
    return (
      <div className="ml-8 self-end rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap">
        {message.text}
      </div>
    )
  return (
    <div className="grid gap-3">
      {message.text ? <Markdown text={message.text} /> : null}
      {message.status === 'stopped' ? (
        <p className="text-muted-foreground text-xs">{t`Stopped`}</p>
      ) : null}
      {message.failure ? <Failure failure={message.failure} /> : null}
      {message.proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </div>
  )
}

function Failure({ failure }: { failure: AiFailure }) {
  const { t } = useLingui()
  const { close } = useAssistant()
  return (
    <div className="grid gap-2">
      <FailureNotice failure={failure} />
      {NEEDS_PERSON.includes(failure) ? (
        <Link to="/ai-provider" className="w-fit text-sm underline" onClick={close}>
          {t`Open the AI provider page`}
        </Link>
      ) : null}
    </div>
  )
}

function ConversationList({ onOpen }: { onOpen: (id: string | null) => void }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const list = useListConversations()
  const rename = useRenameConversation()
  const remove = useDeleteConversation()
  const { conversationId } = useAssistant()
  const formatRelative = useFormatRelative()
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })

  return (
    <div className="grid content-start gap-2 overflow-y-auto p-4">
      <Button variant="outline" className="justify-self-start" onClick={() => onOpen(null)}>
        <SquarePenIcon aria-hidden />
        {t`New conversation`}
      </Button>
      {list.data?.length ? (
        <ul className="grid gap-1" aria-label={t`Conversations`}>
          {list.data.map((c) => {
            const when = formatRelative(c.lastActivityAt)
            const title = c.title || t`New conversation`
            return (
              <li
                key={c.id}
                className="group grid grid-cols-[1fr_auto] items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted aria-[current=true]:bg-muted"
                aria-current={c.id === conversationId}
              >
                <div className="grid min-w-0">
                  <InlineEdit
                    label={t`Conversation title`}
                    value={title}
                    maxLength={80}
                    savedMessage={t`Title saved`}
                    editHint={t`Enter to save, Escape to cancel`}
                    onSave={async (next) => {
                      await rename.mutateAsync({ conversationId: c.id, data: { title: next } })
                      await refresh()
                    }}
                  />
                  <button
                    type="button"
                    className="w-fit cursor-pointer text-left text-muted-foreground text-xs underline"
                    onClick={() => onOpen(c.id)}
                  >
                    {t`Open · ${when}`}
                  </button>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t`Delete ${title}`}
                        className="text-muted-foreground"
                      />
                    }
                  >
                    <Trash2Icon aria-hidden />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t`Delete this conversation?`}</AlertDialogTitle>
                      <AlertDialogDescription>{t`Its messages are deleted. Changes already applied stay.`}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          void remove.mutateAsync({ conversationId: c.id }).then(async () => {
                            await refresh()
                            if (c.id === conversationId) onOpen(null)
                          })
                        }
                      >
                        {t`Delete`}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t`No conversation yet.`}</p>
      )}
    </div>
  )
}

/** The latest guide design progress of the conversation (spec 006 US1), as a segmented bar. */
function GuideProgressBar({ proposals }: { proposals: readonly Proposal[] }) {
  const { t, i18n } = useLingui()
  const latest = proposals.findLast((p) => p.kind === 'report_guide_progress' && p.preview.progress)
  const progress = latest?.preview.progress
  if (!progress) return null
  const study = latest.preview.studyName ?? ''
  const count = progress.items.length
  return (
    <div className="grid gap-1 border-b px-4 py-2.5">
      <p className="truncate font-medium text-xs">{t`Interview guide · ${study}`}</p>
      <SegmentedProgress
        label={t`Interview guide design progress`}
        percent={progress.percent}
        listLabel={t`${count} points`}
        segments={progress.items.map((item) => {
          const point = GUIDE_POINTS[item.key]
          return {
            key: item.key,
            label: point ? i18n._(point) : item.key,
            weight: item.weight,
            status: item.status,
            statusLabel: i18n._(POINT_STATES[item.status]),
          }
        })}
      />
    </div>
  )
}

/** The assistant panel (spec 005): conversation, list of conversations, composer. */
export function AssistantPanel() {
  const { t, i18n } = useLingui()
  const {
    open,
    close,
    conversationId,
    setConversationId,
    pending,
    clearPending,
    rememberThread,
    setAnswering,
  } = useAssistant()
  const queryClient = useQueryClient()
  const page = usePageRef()
  const navigate = useNavigate()
  const create = useCreateConversation()
  const conversation = useGetConversation(conversationId ?? '', {
    query: { enabled: Boolean(conversationId), retry: false },
  })
  const [view, setView] = useState<'chat' | 'list'>('chat')
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState<Live | null>(null)
  // From Send until the stored answer is shown again (Stop included): one message at a time.
  const [busy, setBusy] = useState(false)
  useEffect(() => setAnswering(busy), [busy, setAnswering])
  const [sendError, setSendError] = useState<unknown>(null)
  const abort = useRef<AbortController | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  /** Follows new words while the person is at the bottom; scrolling up stops it. */
  const follow = useRef(true)
  const fieldId = useId()
  const streaming = live !== null && abort.current !== null && !abort.current.signal.aborted

  // A conversation deleted elsewhere: start a new one.
  useEffect(() => {
    if (conversation.isError) setConversationId(null)
  }, [conversation.isError, setConversationId])

  useEffect(() => {
    if (open && view === 'chat') field.current?.focus()
  }, [open, view])

  // Keep the latest words in view while an answer is written, unless the person scrolled up to
  // read: then the conversation stays where they are until they come back to the bottom.
  const messageCount = conversation.data?.messages.length ?? 0
  const liveLength = live?.text.length ?? 0
  const liveCards = live?.proposals.length ?? 0
  const sending = live?.personText
  useLayoutEffect(() => {
    const el = log.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [messageCount, liveLength, liveCards, sending, conversationId, view])
  const onScroll = () => {
    const el = log.current
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  /** `request`: a message sent for the person by a page action (spec 006 "Design with the assistant"). */
  const submit = async (request?: { text: string; thread?: string | undefined }) => {
    const text = (request?.text ?? draft).trim()
    if (!text || busy) return
    setBusy(true)
    setSendError(null)
    let id = conversationId
    if (!id) {
      id = (await create.mutateAsync()).id
      setConversationId(id)
      if (request?.thread) rememberThread(request.thread, id)
    }
    if (request === undefined) setDraft('')
    // Sending brings the conversation back to its end.
    follow.current = true
    const controller = new AbortController()
    abort.current = controller
    setLive({
      personText: text,
      text: '',
      proposals: [],
      failure: null,
      shownBefore: conversationId ? (conversation.data?.messages.length ?? 0) : 0,
    })
    try {
      await sendAssistantMessage(
        id,
        { text, page, language: normalise(i18n.locale) },
        (event) => {
          // The assistant opened a page: go there, as if the person had clicked (US5).
          const result = event.type === 'proposal' ? event.proposal.result : null
          if (event.type === 'proposal' && result && /^open_/.test(event.proposal.kind))
            void (result.kind === 'study'
              ? navigate({
                  to: '/studies/$studyId',
                  params: { studyId: result.id },
                  search: event.proposal.preview.phase
                    ? { phase: event.proposal.preview.phase }
                    : {},
                })
              : navigate({ to: '/projects/$projectId', params: { projectId: result.id } }))
          setLive((current) => {
            if (!current) return current
            if (event.type === 'text') return { ...current, text: current.text + event.delta }
            if (event.type === 'proposal')
              // Same shape as the API's Proposal; only optional fields are typed differently.
              return { ...current, proposals: [...current.proposals, event.proposal as Proposal] }
            if (event.type === 'error') return { ...current, failure: event.failure }
            return current
          })
        },
        controller.signal,
      )
    } catch (error) {
      // Stopped by the person: the server keeps what was written. Anything else is shown, and the
      // message is given back so nothing typed is lost.
      if (!controller.signal.aborted) {
        setSendError(error)
        if (request === undefined) setDraft(text)
      }
    } finally {
      abort.current = null
      const key = getGetConversationQueryKey(id)
      // A read started while the answer was written would be reused as is (TanStack Query joins
      // an in-flight fetch when there is no data yet) and show it unfinished: cancel it, read again.
      const reread = async () => {
        await queryClient.cancelQueries({ queryKey: key })
        return queryClient.fetchQuery({
          queryKey: key,
          queryFn: () => getConversation(id),
          staleTime: 0,
        })
      }
      let fresh = await reread().catch(() => null)
      // After Stop, the server saves the partial answer once it sees the request closed.
      for (
        let attempt = 0;
        attempt < 5 && fresh?.messages.at(-1)?.status === 'streaming';
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200))
        fresh = await reread().catch(() => null)
      }
      await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() })
      setLive(null)
      setBusy(false)
    }
  }

  // A page asked the assistant something for the person: send it once, on a new conversation.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    if (!open || !pending || busy || conversationId) return
    clearPending()
    setView('chat')
    void submitRef.current(pending)
  }, [open, pending, busy, conversationId, clearPending])

  const progressSources = [
    ...(conversation.data?.messages.flatMap((m) => m.proposals) ?? []),
    ...(live?.proposals ?? []),
  ]

  const openConversation = (id: string | null) => {
    follow.current = true
    setConversationId(id)
    setView('chat')
  }

  const title = conversation.data ? conversation.data.title || t`New conversation` : t`Assistant`

  return (
    <>
      <header className="flex min-h-16 items-center gap-1 border-b px-3 py-2.5">
        <h2 className="min-w-0 flex-1 truncate font-semibold text-base">
          {view === 'list' ? t`Conversations` : title}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`Conversations`}
          aria-pressed={view === 'list'}
          onClick={() => setView(view === 'list' ? 'chat' : 'list')}
        >
          <HistoryIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t`New conversation`}
          onClick={() => openConversation(null)}
        >
          <SquarePenIcon aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t`Close the assistant`} onClick={close}>
          <XIcon aria-hidden />
        </Button>
      </header>

      {view === 'list' ? (
        <ConversationList onOpen={openConversation} />
      ) : (
        <>
          <GuideProgressBar proposals={progressSources} />
          <div
            ref={log}
            onScroll={onScroll}
            role="log"
            aria-label={t`Conversation`}
            aria-busy={streaming}
            className="grid flex-1 content-start gap-4 overflow-y-auto p-4 text-sm"
          >
            {!conversationId && !live ? (
              <p className="text-muted-foreground">{t`Ask anything about your research. The assistant sees the page you are on and can propose changes, which you apply or dismiss.`}</p>
            ) : null}
            {conversation.data?.messages.slice(0, live ? live.shownBefore : undefined).map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {live ? (
              <>
                <div className="ml-8 self-end rounded-lg bg-muted px-3 py-2 whitespace-pre-wrap">
                  {live.personText}
                </div>
                <div className="grid gap-3">
                  {live.text ? (
                    <Markdown text={live.text} />
                  ) : (
                    <p className="text-muted-foreground">{t`Thinking…`}</p>
                  )}
                  {live.failure ? <Failure failure={live.failure} /> : null}
                  {live.proposals.map((p) => (
                    <ProposalCard key={p.id} proposal={p} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          {sendError ? (
            <p role="alert" className="mx-3 mb-2 text-destructive text-sm">
              {errorMessage(i18n, sendError)}
            </p>
          ) : null}
          <form
            className="grid gap-2 border-t p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              {t`Message to the assistant`}
            </label>
            <Textarea
              id={fieldId}
              ref={field}
              value={draft}
              rows={3}
              placeholder={t`Ask the assistant…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              className="max-h-48 resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <LookingAt />
              <div className="flex items-center gap-1.5">
                {conversation.data ? (
                  <ConversationCostIndicator cost={conversation.data.cost} />
                ) : null}
                {streaming ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => abort.current?.abort()}
                  >
                    <SquareIcon aria-hidden />
                    {t`Stop`}
                  </Button>
                ) : (
                  <Button type="submit" size="sm" disabled={!draft.trim() || busy}>
                    <SendIcon aria-hidden />
                    {t`Send`}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </>
      )}
    </>
  )
}
