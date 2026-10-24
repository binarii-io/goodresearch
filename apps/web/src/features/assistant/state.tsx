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
}

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
  const value = useMemo(
    () => ({ open, toggle, close, conversationId, setConversationId }),
    [open, toggle, close, conversationId, setConversationId],
  )
  return <AssistantContext value={value}>{children}</AssistantContext>
}

export const useAssistant = (): AssistantState => {
  const state = useContext(AssistantContext)
  if (!state) throw new Error('useAssistant outside AssistantProvider')
  return state
}

export const ASSISTANT_PANEL_ID = 'assistant-panel'
