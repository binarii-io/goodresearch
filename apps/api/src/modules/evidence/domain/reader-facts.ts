import { maskBilingual, withPlaceholders } from '@goodresearch/shared'
import type { Fact } from './facts.ts'

export type ReaderVerbatim = {
  readonly id: string
  readonly segmentId: string
  readonly text: string
  readonly participant: string | null
  readonly setAside: boolean
}

/** The number of each validated interview, in the order of interview dates. */
export const readerInterviewNumbers = (ids: readonly string[]): ReadonlyMap<string, number> =>
  new Map(ids.map((id, index) => [id, index + 1]))

/**
 * Spec 026 FR-015 to FR-017: a fact outside the team. Its interview is a number; its verbatims come
 * only on an anonymised study, with pseudonyms. Names are masked by `maskReaderFact`, on what is shown.
 */
export const readerFact = (
  fact: Fact,
  context: {
    readonly interviews: ReadonlyMap<string, number>
    readonly anonymised: boolean
    readonly verbatims: ReadonlyMap<string, ReaderVerbatim>
  },
) => {
  const verbatims = context.anonymised
    ? fact.verbatimIds
        .flatMap((id) => context.verbatims.get(id) ?? [])
        // A quote without a pseudonym is not shown: its speaker is still to attribute (FR-017).
        .filter((v) => !v.setAside && v.participant !== null)
        .map((v) => ({
          id: v.id,
          text: v.text,
          segmentId: v.segmentId,
          participant: v.participant,
          lost: false,
        }))
    : []
  return {
    id: fact.id,
    sessionId: fact.sessionId,
    interviewNumber: context.interviews.get(fact.sessionId) ?? 0,
    statement: fact.statement,
    translation: fact.translation,
    polarity: fact.polarity,
    theme: fact.theme,
    verbatims,
    participants: [...new Set(verbatims.flatMap((v) => v.participant ?? []))],
    origin: fact.origin,
    status: fact.status,
    decidedBy: null,
    decidedAt: fact.decidedAt?.toISOString() ?? null,
    version: fact.version,
  }
}

/** Every name the app knows is masked in a reader's words, statements included. */
export const maskReaderFact = (
  fact: ReturnType<typeof readerFact>,
  names: readonly string[],
): ReturnType<typeof readerFact> => ({
  ...fact,
  statement: maskBilingual(fact.statement, names),
  verbatims: fact.verbatims.map((v) => ({ ...v, text: withPlaceholders(v.text, names).text })),
})
