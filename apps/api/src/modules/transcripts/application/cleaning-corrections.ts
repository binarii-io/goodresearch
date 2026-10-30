import {
  type Correction,
  lexiconCorrections,
  nameCorrections,
  type Person,
} from '../domain/corrections.ts'
import type { Transcript } from '../domain/lexicon-run.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import type { Verdict } from '../domain/occurrences.ts'
import type { Segment } from '../domain/segments.ts'
import type { CleaningDeps } from './ports.ts'

/** A stored correction or suggestion still on its turn (the raw version may have changed since). */
const stillThere = (
  segments: ReadonlyMap<string, Segment>,
  c: { segmentId: string; offset: number },
  original?: string,
  target?: string,
) => {
  const segment = segments.get(c.segmentId)
  if (!segment) return false
  if (original === undefined) return true
  return target === 'speaker'
    ? segment.speaker === original
    : segment.text.slice(c.offset, c.offset + original.length) === original
}

/** The people terms: their names never go to the AI, and become "[Person]" when anonymised. */
export const personTerms = (terms: readonly LexiconTerm[]) =>
  terms.filter((t) => t.category === 'person' && t.status !== 'merged' && t.status !== 'rejected')

/**
 * Every correction of an interview (research R2): the lexicon's and the names' computed now, the
 * stored ones still on their turn. Read by the cleaning queries and commands alike.
 */
export const loadCorrections = async (
  deps: CleaningDeps,
  input: {
    readonly accountId: string
    readonly studyId: string
    readonly teamId: string
    readonly anonymised: boolean
    readonly transcript: Transcript
    /** Already read for the whole study (the list of interviews). */
    readonly preloaded?:
      | {
          terms: LexiconTerm[]
          verdicts: Verdict[]
          people: Readonly<Record<string, readonly Person[]>> | null
        }
      | undefined
    /** A run or a validation gives the missing codes; a read only reads them. */
    readonly assign?: boolean
  },
): Promise<{ all: Correction[]; terms: LexiconTerm[]; people: readonly Person[] }> => {
  const { transcript: t } = input
  const [terms, verdicts, suggestions, stored, decisions, names] = await Promise.all([
    input.preloaded?.terms ?? deps.store.teamTerms(input.teamId),
    input.preloaded?.verdicts ?? deps.store.verdictsOf(input.studyId),
    deps.cleaning.suggestionsOf(t.sessionId),
    deps.cleaning.storedCorrections(t.sessionId),
    deps.cleaning.decisionsOf(t.sessionId),
    !input.anonymised
      ? Promise.resolve(null)
      : input.preloaded
        ? Promise.resolve(input.preloaded.people)
        : deps
            .cleaningNames(input.accountId, input.studyId, { assign: input.assign === true })
            .then((n) => n?.people ?? null),
  ])
  const interview = { sessionId: t.sessionId, language: t.language, segments: t.segments }
  const segments = new Map(t.segments.map((s) => [s.id, s]))
  const people = names?.[t.sessionId] ?? []
  return {
    terms,
    people,
    all: [
      ...lexiconCorrections(
        interview,
        terms,
        verdicts.filter((v) => v.sessionId === t.sessionId),
        suggestions.filter((s) => stillThere(segments, s)),
      ),
      ...(input.anonymised
        ? nameCorrections(interview, people, personTerms(terms), decisions)
        : []),
      // An AI name correction is for an anonymised study only (review of PR #11).
      ...stored.filter(
        (c) =>
          stillThere(segments, c, c.original, c.target) && (input.anonymised || c.kind !== 'name'),
      ),
    ],
  }
}
