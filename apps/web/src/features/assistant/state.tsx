import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

const OPEN_KEY = 'goodresearch.assistant'
const CONVERSATION_KEY = 'goodresearch.assistant.conversation'

// Browser storage can be unavailable (private mode): the panel then starts closed.
const read = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
  } catch {
    // Only the memory of the choice is lost.
  }
}

type AssistantState = {
  open: boolean
  toggle: () => void
  close: () => void
  conversationId: string | null
  setConversationId: (id: string | null) => void
  /**
   * Opens the panel on a new conversation and sends `text` as the person's message (spec 006:
   * "Design with the assistant"). With a `thread` (e.g. one study's guide), the conversation
   * started for it last time is reopened instead, as it was. Never while an answer is written.
   */
  ask: (text: string, options?: { thread?: string }) => void
  /** The message `ask` is waiting to send; the panel sends it once and clears it. */
  pending: { text: string; thread?: string | undefined } | null
  clearPending: () => void
  /** Remembers the conversation started for a thread. */
  rememberThread: (thread: string, conversationId: string) => void
  /** An answer is being written: `ask` then only opens the panel. */
  answering: boolean
  setAnswering: (answering: boolean) => void
  /** A project just applied from a card: the panel continues the answer on it (spec 018 US3). */
  appliedProject: { projectId: string; conversationId: string | null } | null
  setAppliedProject: (applied: AssistantState['appliedProject']) => void
}

const threadKey = (thread: string) => `goodresearch.assistant.thread.${thread}`

const AssistantContext = createContext<AssistantState | null>(null)

/** Open state and current conversation of the assistant panel, remembered per browser (FR-003). */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => read(OPEN_KEY) === 'open')
  const [conversationId, setConversation] = useState(() => read(CONVERSATION_KEY))
  const toggle = useCallback(
    () =>
      setOpen((value) => {
        write(OPEN_KEY, value ? 'closed' : 'open')
        return !value
      }),
    [],
  )
  const close = useCallback(() => {
    write(OPEN_KEY, 'closed')
    setOpen(false)
  }, [])
  const setConversationId = useCallback((id: string | null) => {
    write(CONVERSATION_KEY, id)
    setConversation(id)
  }, [])
  const [pending, setPending] = useState<AssistantState['pending']>(null)
  const [answering, setAnswering] = useState(false)
  const [appliedProject, setAppliedProject] = useState<AssistantState['appliedProject']>(null)
  const ask = useCallback(
    (text: string, options: { thread?: string } = {}) => {
      write(OPEN_KEY, 'open')
      setOpen(true)
      if (answering) return
      const known = options.thread ? read(threadKey(options.thread)) : null
      if (known) {
        setConversationId(known)
        return
      }
      setConversationId(null)
      setPending({ text, thread: options.thread })
    },
    [setConversationId, answering],
  )
  const clearPending = useCallback(() => setPending(null), [])
  const rememberThread = useCallback(
    (thread: string, id: string) => write(threadKey(thread), id),
    [],
  )
  const value = useMemo(
    () => ({
      open,
      toggle,
      close,
      conversationId,
      setConversationId,
      ask,
      pending,
      clearPending,
      rememberThread,
      answering,
      setAnswering,
      appliedProject,
      setAppliedProject,
    }),
    [
      open,
      toggle,
      close,
      conversationId,
      setConversationId,
      ask,
      pending,
      clearPending,
      rememberThread,
      answering,
      appliedProject,
    ],
  )
  return <AssistantContext value={value}>{children}</AssistantContext>
}

export const useAssistant = (): AssistantState => {
  const state = useContext(AssistantContext)
  if (!state) throw new Error('useAssistant outside AssistantProvider')
  return state
}

export const ASSISTANT_PANEL_ID = 'assistant-panel'
