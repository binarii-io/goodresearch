import type { StoredMessage, StoredProposal } from './ports.ts'

/** A proposal as the person sees it; `invalid` ones are never shown. */
export const proposalView = (p: StoredProposal) => ({
  id: p.id,
  kind: p.kind,
  // `applying` is shown as proposed: the Apply in progress answers with the final state.
  state:
    p.state === 'invalid'
      ? ('failed' as const)
      : p.state === 'applying'
        ? ('proposed' as const)
        : p.state,
  preview: p.preview,
  result: p.resultKind && p.resultId ? { kind: p.resultKind, id: p.resultId } : null,
  error: p.error,
})

/**
 * An answer still "streaming" this long after it started lost its server (restart, redeploy) before
 * it could be saved: it is shown as stopped. Longer than any request timeout a deployment should use.
 */
export const ANSWER_LOST_AFTER_MS = 30 * 60_000

export const messageView = (m: StoredMessage, proposals: readonly StoredProposal[], now: Date) => ({
  id: m.id,
  role: m.role,
  text: m.text,
  status:
    m.status === 'streaming' && now.getTime() - m.createdAt.getTime() > ANSWER_LOST_AFTER_MS
      ? ('stopped' as const)
      : m.status,
  failure: m.failure,
  proposals: proposals
    .filter((p) => p.messageId === m.id && p.state !== 'invalid')
    .map(proposalView),
  createdAt: m.createdAt.toISOString(),
})
