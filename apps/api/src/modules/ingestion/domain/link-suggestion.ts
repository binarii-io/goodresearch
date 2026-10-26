import { fileWords, nameWords } from './file-words.ts'

export type PlannedCandidate = {
  readonly id: string
  readonly interviewee: string
  readonly scheduledAt: string | null
}

export type LinkSuggestion = {
  readonly plannedInterviewId: string
  readonly rule: 'transcript' | 'name' | 'date'
}

/** The one candidate sharing the most words with `words`, if no other shares as many. */
const bestByWords = (words: ReadonlySet<string>, candidates: readonly PlannedCandidate[]) => {
  let best: { ids: string[]; score: number } = { ids: [], score: 0 }
  for (const c of candidates) {
    const score = nameWords(c.interviewee).filter((w) => words.has(w)).length
    if (score === 0) continue
    if (score > best.score) best = { ids: [c.id], score }
    else if (score === best.score) best.ids.push(c.id)
  }
  return best.ids.length === 1 ? (best.ids[0] as string) : null
}

const DAY = 24 * 60 * 60_000

/**
 * The planned interview a transcript probably belongs to (spec 008 FR-005, research R4), among the
 * ones no other session holds. First by the people the analysis found in the transcript (spec 009:
 * badly named files still match, and the schedule never leaves the app), then by the file name:
 * the planned interviewee sharing the most words, if no other shares as many. Otherwise, a tie
 * included, by date (the interview date when known, else the file's): the only planned interview
 * within 24 hours. Never a guess between equals.
 */
export const suggestLink = (
  transcript: { readonly name: string; readonly modifiedAt: string | null },
  candidates: readonly PlannedCandidate[],
  found: { readonly names: readonly string[]; readonly date: string | null } = {
    names: [],
    date: null,
  },
): LinkSuggestion | null => {
  const people = bestByWords(new Set(found.names.flatMap(nameWords)), candidates)
  if (people) return { plannedInterviewId: people, rule: 'transcript' }
  const byName = bestByWords(fileWords(transcript.name), candidates)
  if (byName) return { plannedInterviewId: byName, rule: 'name' }

  const when = found.date ? `${found.date}T12:00:00Z` : transcript.modifiedAt
  const at = when ? Date.parse(when) : Number.NaN
  if (Number.isNaN(at)) return null
  const close = candidates.filter(
    (c) => c.scheduledAt !== null && Math.abs(Date.parse(c.scheduledAt) - at) <= DAY,
  )
  return close.length === 1
    ? { plannedInterviewId: (close[0] as PlannedCandidate).id, rule: 'date' }
    : null
}
