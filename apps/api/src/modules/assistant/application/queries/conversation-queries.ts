import type { AssistantDeps } from '../ports.ts'
import { messageView } from '../views.ts'

const totalOf = async (
  deps: AssistantDeps,
  accountId: string,
  studyId: string,
  answersOf: () => Promise<string[]>,
) => {
  if (!(await deps.research.getStudy(accountId, studyId))) return null
  const answers = await answersOf()
  const costs = await deps.studyCosts(answers)
  const values = answers.map((id) => costs.get(id) ?? null)
  return {
    currency: 'USD' as const,
    total: values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0),
  }
}

export const makeConversationQueries = (deps: AssistantDeps) => ({
  /**
   * Spec 027 FR-012: what designing a study's questionnaire cost, whoever ran it; a total only, a
   * conversation stays private. Unknown as soon as one call has no price.
   */
  questionnaireDesignCost: (accountId: string, studyId: string) =>
    totalOf(deps, accountId, studyId, () =>
      deps.store.answersWithSkill(studyId, 'questionnaire-design'),
    ),

  /** Spec 036 FR-011: the same for the design of a usability test's protocol. */
  protocolDesignCost: (accountId: string, studyId: string) =>
    totalOf(deps, accountId, studyId, () =>
      deps.store.answersWithSkill(studyId, 'test-protocol-design'),
    ),

  /** Spec 028 FR-013: the same for the target rules the assistant proposed. */
  targetRuleCost: (accountId: string, studyId: string) =>
    totalOf(deps, accountId, studyId, () =>
      deps.store.answersWithCard(studyId, 'propose_target_rule'),
    ),

  list: async (accountId: string) =>
    (await deps.store.listConversations(accountId)).map((c) => ({
      id: c.id,
      title: c.title,
      lastActivityAt: c.lastActivityAt.toISOString(),
    })),

  /** Only the owner's conversation (FR-008); null otherwise. */
  get: async (accountId: string, conversationId: string) => {
    const conversation = await deps.store.getConversation(accountId, conversationId)
    if (!conversation) return null
    const messages = await deps.store.listMessages(conversationId)
    const proposals = await deps.store.listProposals(conversationId)
    const answers = messages.filter((m) => m.role === 'assistant').map((m) => m.id)
    const costs = await deps.costs(accountId, answers)
    const values = answers.map((id) => costs.get(id) ?? null)
    return {
      id: conversation.id,
      title: conversation.title,
      messages: messages.map((m) => messageView(m, proposals, deps.clock.now())),
      // Unknown as soon as one call has no price, rather than a total that looks complete.
      cost: {
        currency: 'USD' as const,
        total: values.some((v) => v === null)
          ? null
          : values.reduce<number>((a, v) => a + (v ?? 0), 0),
        last: values.length > 0 ? (values.at(-1) ?? null) : 0,
      },
    }
  },
})

export type ConversationQueries = ReturnType<typeof makeConversationQueries>
