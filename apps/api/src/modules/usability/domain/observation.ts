import { err, ok, type Result } from '@goodresearch/shared'

/** What an observation is (spec 038): one finding of a task, with its moment and evidence. */
export const OBSERVATION_KINDS = [
  'difficulty',
  'error',
  'positive',
  'verbatim',
  'assisted',
  'sus-answer',
] as const
export type ObservationKind = (typeof OBSERVATION_KINDS)[number]

export const TEXT_MAX = 400
export const QUOTE_MAX = 300

/** What the judge said, and the arbiter on a disagreement (FR-007). */
export type JudgeVerdict = 'kept' | 'not-confirmed' | 'rejected'
export type ArbiterVerdict = 'kept' | 'rejected'

export type ObservationStatus = 'proposed' | 'accepted' | 'edited' | 'rejected'

export type Observation = {
  readonly id: string
  readonly analysisId: string
  readonly taskId: string | null
  readonly kind: ObservationKind
  readonly momentMs: number
  readonly text: string
  /** Verified in the session's transcript, or null when the evidence is what is seen. */
  readonly quote: string | null
  readonly seen: string | null
  readonly susItem: number | null
  readonly susValue: number | null
  readonly screenshotKey: string | null
  readonly judge: JudgeVerdict | null
  readonly judgeReason: string | null
  readonly arbiter: ArbiterVerdict | null
  readonly arbiterReason: string | null
  readonly origin: 'ai' | 'person'
  readonly status: ObservationStatus
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
}

/** Whether the checks rejected it: the arbiter's word is final, else the judge's. */
export const checksRejected = (o: Pick<Observation, 'judge' | 'arbiter'>): boolean =>
  o.arbiter ? o.arbiter === 'rejected' : o.judge === 'rejected'

/** The polarity of the fact it gives (FR-022). */
export const polarityOf = (kind: ObservationKind): 'positive' | 'negative' | 'neutral' =>
  kind === 'positive'
    ? 'positive'
    : kind === 'difficulty' || kind === 'error' || kind === 'assisted'
      ? 'negative'
      : 'neutral'

/** Facts come from findings, not from questionnaire answers (results of the study instead). */
export const givesFact = (o: Pick<Observation, 'kind' | 'status' | 'judge' | 'arbiter'>): boolean =>
  o.kind !== 'sus-answer' && (o.status !== 'proposed' || !checksRejected(o))

const plain = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\W+/g, ' ').trim()

/** The same finding: kind, task, close moment (10 s) and text (spec 038 data model). */
export const sameFinding = (
  a: Pick<Observation, 'kind' | 'taskId' | 'momentMs' | 'text'>,
  b: Pick<Observation, 'kind' | 'taskId' | 'momentMs' | 'text'>,
) =>
  a.kind === b.kind &&
  a.taskId === b.taskId &&
  Math.abs(a.momentMs - b.momentMs) <= 10_000 &&
  plain(a.text) === plain(b.text)

/** Observations found twice (overlapping chunks, two passes): the first one is kept. */
export const dedupe = <T extends Pick<Observation, 'kind' | 'taskId' | 'momentMs' | 'text'>>(
  list: readonly T[],
): T[] => {
  const kept: T[] = []
  for (const o of list) if (!kept.some((k) => sameFinding(k, o))) kept.push(o)
  return kept
}

export type ObservationEdit = {
  readonly kind?: ObservationKind | undefined
  readonly taskId?: string | null | undefined
  readonly text?: string | undefined
  readonly momentMs?: number | undefined
}

export type ObservationAction =
  | { readonly action: 'accept' }
  | { readonly action: 'reject' }
  | { readonly action: 'reopen' }
  | { readonly action: 'edit'; readonly value: ObservationEdit }

/** A person's decision on an observation, at the version they saw (FR-009). */
export const decideObservation = (
  o: Observation,
  decision: ObservationAction,
  by: string,
  now: Date,
): Result<Observation, 'INVALID_TRANSITION' | 'VALIDATION'> => {
  if (decision.action === 'reopen') {
    if (o.status === 'proposed') return err('INVALID_TRANSITION')
    return ok({ ...o, status: 'proposed', decidedBy: null, decidedAt: null })
  }
  if (decision.action === 'accept' || decision.action === 'reject')
    return ok({
      ...o,
      status: decision.action === 'accept' ? 'accepted' : 'rejected',
      decidedBy: by,
      decidedAt: now,
    })
  const v = decision.value
  const text = v.text?.trim() ?? o.text
  if (text.length < 1 || text.length > TEXT_MAX) return err('VALIDATION')
  if (v.momentMs !== undefined && (!Number.isInteger(v.momentMs) || v.momentMs < 0))
    return err('VALIDATION')
  return ok({
    ...o,
    kind: v.kind ?? o.kind,
    taskId: v.taskId === undefined ? o.taskId : v.taskId,
    text,
    momentMs: v.momentMs ?? o.momentMs,
    status: 'edited',
    decidedBy: by,
    decidedAt: now,
  })
}

/**
 * A new analysis of the session (FR-010): decided observations stay, undecided ones are replaced,
 * and a found one a person rejected before is not proposed again.
 */
export const mergeAnalyses = <T extends Observation>(
  previous: readonly Observation[],
  found: readonly T[],
): { keep: Observation[]; add: T[] } => {
  const keep = previous.filter((o) => o.status !== 'proposed')
  const rejected = keep.filter((o) => o.status === 'rejected')
  const decided = keep.filter((o) => o.status !== 'rejected')
  const add = found.filter(
    (f) => !rejected.some((r) => sameFinding(r, f)) && !decided.some((d) => sameFinding(d, f)),
  )
  return { keep, add }
}
