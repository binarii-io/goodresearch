import type { Observation } from './observation.ts'
import { susMean, susScore } from './sus.ts'
import type { Outcome, TaskResult } from './task-result.ts'

/** What the study results read of one analysed session (decided items only, FR-014). */
export type SessionForResults = {
  readonly sessionId: string
  /** The task ids of the protocol version the session was run against (FR-015). */
  readonly taskIds: readonly string[]
  readonly tasks: readonly TaskResult[]
  readonly observations: readonly Observation[]
}

const median = (values: readonly number[]): number | null => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] ?? null) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2)
}

const decided = (o: Observation) => o.status === 'accepted' || o.status === 'edited'
const plain = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\W+/g, ' ').trim()

export type TaskSummary = {
  readonly taskId: string
  readonly sessions: number
  readonly outcomes: Record<Outcome, number>
  readonly medianMs: number | null
  readonly difficulties: { text: string; sessions: number }[]
  readonly ease: number[]
}

/** Per task across sessions, matched by id; a task absent from a session's version is not counted. */
export const studyResults = (
  taskIds: readonly string[],
  sessions: readonly SessionForResults[],
) => {
  const tasks: TaskSummary[] = taskIds.map((taskId) => {
    const runs = sessions.filter((s) => s.taskIds.includes(taskId))
    const results = runs.flatMap((s) =>
      s.tasks.filter((t) => t.taskId === taskId && t.status !== 'proposed'),
    )
    const outcomes: Record<Outcome, number> = {
      success: 0,
      partial: 0,
      failure: 0,
      'not-attempted': 0,
    }
    for (const r of results) outcomes[r.outcome]++
    const byText = new Map<string, { text: string; sessions: Set<string> }>()
    for (const s of runs)
      for (const o of s.observations)
        if (o.taskId === taskId && decided(o) && (o.kind === 'difficulty' || o.kind === 'error')) {
          const key = plain(o.text)
          const entry = byText.get(key) ?? { text: o.text, sessions: new Set<string>() }
          entry.sessions.add(s.sessionId)
          byText.set(key, entry)
        }
    return {
      taskId,
      sessions: results.length,
      outcomes,
      medianMs: median(
        results
          .filter((r) => r.outcome !== 'not-attempted')
          .flatMap((r) => (r.timeOnTaskMs === null ? [] : [r.timeOnTaskMs])),
      ),
      difficulties: [...byText.values()]
        .map((d) => ({ text: d.text, sessions: d.sessions.size }))
        .sort((a, b) => b.sessions - a.sessions || a.text.localeCompare(b.text)),
      ease: results.flatMap((r) => (r.ease === null ? [] : [r.ease])),
    }
  })
  const perSession = sessions.map((s) => ({
    sessionId: s.sessionId,
    score: susScore(
      new Map(
        s.observations
          .filter(
            (o) =>
              o.kind === 'sus-answer' && decided(o) && o.susItem !== null && o.susValue !== null,
          )
          .map((o) => [o.susItem as number, o.susValue as number]),
      ),
    ),
  }))
  const toReview = sessions.reduce(
    (n, s) =>
      n +
      s.observations.filter((o) => o.status === 'proposed').length +
      s.tasks.filter((t) => t.status === 'proposed').length,
    0,
  )
  return { tasks, sus: { ...susMean(perSession.map((p) => p.score)), perSession }, toReview }
}
