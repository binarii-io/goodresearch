import { fileWords, nameWords } from './file-words.ts'

export type PlannedCandidate = {
  readonly id: string
  readonly interviewee: string
  readonly scheduledAt: string | null
}

export type LinkSuggestion = { readonly plannedInterviewId: string; readonly rule: 'name' | 'date' }

const DAY = 24 * 60 * 60_000

/**
 * The planned interview a transcript probably belongs to (spec 008 FR-005, research R4), among the
 * ones no other session holds. By name first: the planned interview whose interviewee shares the
 * most words with the file name, if no other shares as many. Otherwise, a tie included, by date: the
 * only planned interview within 24 hours. Never a guess between equals.
 */
export const suggestLink = (
  transcript: { readonly name: string; readonly modifiedAt: string | null },
  candidates: readonly PlannedCandidate[],
): LinkSuggestion | null => {
  const words = fileWords(transcript.name)
  let best: { ids: string[]; score: number } = { ids: [], score: 0 }
  for (const c of candidates) {
    const score = nameWords(c.interviewee).filter((w) => words.has(w)).length
    if (score === 0) continue
    if (score > best.score) best = { ids: [c.id], score }
    else if (score === best.score) best.ids.push(c.id)
  }
  if (best.ids.length === 1) return { plannedInterviewId: best.ids[0] as string, rule: 'name' }

  const at = transcript.modifiedAt ? Date.parse(transcript.modifiedAt) : Number.NaN
  if (Number.isNaN(at)) return null
  const close = candidates.filter(
    (c) => c.scheduledAt !== null && Math.abs(Date.parse(c.scheduledAt) - at) <= DAY,
  )
  return close.length === 1
    ? { plannedInterviewId: (close[0] as PlannedCandidate).id, rule: 'date' }
    : null
}
