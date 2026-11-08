import { err, ok, type Result } from '@goodresearch/shared'

export const OUTCOMES = ['success', 'partial', 'failure', 'not-attempted'] as const
export type Outcome = (typeof OUTCOMES)[number]

export const PATH_MAX = 500

/** One task of one session (spec 038 FR-005). */
export type TaskResult = {
  readonly id: string
  readonly analysisId: string
  readonly taskId: string
  readonly outcome: Outcome
  readonly startMs: number | null
  readonly endMs: number | null
  readonly timeOnTaskMs: number | null
  readonly path: string
  readonly ease: number | null
  readonly status: 'proposed' | 'accepted' | 'edited'
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
}

/** Help from the facilitator makes a success partial at most (spec 038 edge case). */
export const outcomeWithHelp = (outcome: Outcome, assisted: boolean): Outcome =>
  assisted && outcome === 'success' ? 'partial' : outcome

export const timeOnTask = (startMs: number | null, endMs: number | null): number | null =>
  startMs !== null && endMs !== null && endMs >= startMs ? endMs - startMs : null

/** A person corrects a task's outcome or time (FR-009). */
export const correctTaskResult = (
  r: TaskResult,
  change: { readonly outcome: Outcome; readonly timeOnTaskMs?: number | null | undefined },
  by: string,
  now: Date,
): Result<TaskResult, 'VALIDATION'> => {
  const time = change.timeOnTaskMs === undefined ? r.timeOnTaskMs : change.timeOnTaskMs
  if (time !== null && (!Number.isInteger(time) || time < 0)) return err('VALIDATION')
  return ok({
    ...r,
    outcome: change.outcome,
    timeOnTaskMs: time,
    status: change.outcome === r.outcome && time === r.timeOnTaskMs ? 'accepted' : 'edited',
    decidedBy: by,
    decidedAt: now,
  })
}
