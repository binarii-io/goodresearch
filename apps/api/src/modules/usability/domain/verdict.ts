import type { ArbiterVerdict, JudgeVerdict } from './observation.ts'

/** What the judge returned, before the app's rules (FR-007). */
export type JudgeAnswer = {
  readonly verdict: JudgeVerdict
  readonly reason: string
  readonly contrary: string | null
}

/**
 * The judge never rejects without contrary evidence: a rejection without it, or without a reason,
 * counts as "not confirmed" (absence of evidence is not proof).
 */
export const judged = (a: JudgeAnswer): { verdict: JudgeVerdict; reason: string } => {
  const reason = a.reason.trim()
  if (a.verdict === 'rejected' && (!a.contrary?.trim() || !reason))
    return { verdict: 'not-confirmed', reason: reason || 'No contrary evidence seen.' }
  return { verdict: a.verdict, reason }
}

/** The reading proposed the observation: any verdict but "kept" is a disagreement for the arbiter. */
export const needsArbiter = (verdict: JudgeVerdict): boolean => verdict !== 'kept'

export const arbitrated = (a: {
  readonly verdict: ArbiterVerdict
  readonly reason: string
}): { verdict: ArbiterVerdict; reason: string } => ({
  verdict: a.verdict,
  reason: a.reason.trim() || (a.verdict === 'kept' ? 'Confirmed.' : 'Not supported.'),
})
