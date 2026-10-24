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

export const messageView = (m: StoredMessage, proposals: readonly StoredProposal[]) => ({
  id: m.id,
  role: m.role,
  text: m.text,
  status: m.status,
  failure: m.failure,
  proposals: proposals
    .filter((p) => p.messageId === m.id && p.state !== 'invalid')
    .map(proposalView),
  createdAt: m.createdAt.toISOString(),
})
