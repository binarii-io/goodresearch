import { ApiError, type AssistantPage } from '@goodresearch/api-client'
import { AssistantStreamEvent } from '@goodresearch/contracts'

/**
 * Reads an answer as server-sent events (contracts/http-api.md). Every event is validated before
 * use; aborting `signal` stops the answer (the server keeps the partial text).
 */
const streamAnswer = async (
  url: string,
  body: unknown,
  onEvent: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    const problem = await response.json().catch(() => undefined)
    throw new ApiError(response.status, problem)
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      const chunk = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      if (chunk.startsWith('data: ')) {
        const parsed = AssistantStreamEvent.safeParse(JSON.parse(chunk.slice(6)))
        if (parsed.success) onEvent(parsed.data)
      }
      end = buffer.indexOf('\n\n')
    }
  }
}

export const sendAssistantMessage = (
  conversationId: string,
  body: { text: string; page: AssistantPage; language: 'en' | 'fr' },
  onEvent: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> =>
  streamAnswer(`/api/assistant/conversations/${conversationId}/messages`, body, onEvent, signal)

/** The answer that follows an applied project, without a message (spec 018 US3). */
export const continueAssistantConversation = (
  conversationId: string,
  body: { page: AssistantPage; language: 'en' | 'fr' },
  onEvent: (event: AssistantStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> =>
  streamAnswer(`/api/assistant/conversations/${conversationId}/continue`, body, onEvent, signal)
