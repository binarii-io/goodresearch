/**
 * The recent messages sent to the model (research R4): newest first until the count or the size
 * budget is reached, returned in conversation order. The last message is always kept.
 */
export const selectHistory = <M extends { readonly text: string }>(
  messages: readonly M[],
  budget: { maxMessages: number; maxCharacters: number },
): M[] => {
  const kept: M[] = []
  let size = 0
  for (let i = messages.length - 1; i >= 0 && kept.length < budget.maxMessages; i--) {
    const message = messages[i]
    if (!message) continue
    if (kept.length > 0 && size + message.text.length > budget.maxCharacters) break
    kept.push(message)
    size += message.text.length
  }
  return kept.reverse()
}
