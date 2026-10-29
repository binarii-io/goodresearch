export type TextAnalysed = 'with-corrections' | 'clean-only'

export type FactsState =
  | 'no-transcript'
  | 'not-clean'
  | 'not-analysed'
  | 'to-analyse-again'
  | 'to-decide'
  | 'done'

/**
 * FR-001, FR-011, research R3: the state of an interview's analysis, derived each time. A word
 * corrected in Cleaning alone does not ask to analyse again: a verbatim lost, a transcript imported
 * again, or a change of the setting or of the anonymisation does.
 */
export const analysisState = (s: {
  readonly hasTranscript: boolean
  /** The analysed text now; null without one (no transcript, or not clean yet). */
  readonly text: { readonly rawImportedAt: Date } | null
  readonly reading: {
    readonly rawImportedAt: Date
    readonly textAnalysed: TextAnalysed
    readonly anonymised: boolean
  } | null
  readonly textAnalysed: TextAnalysed
  readonly anonymised: boolean
  /** Verbatims no longer found in the analysed text. */
  readonly lost: number
  /** Facts still proposed. */
  readonly toDecide: number
}): FactsState => {
  if (!s.hasTranscript) return 'no-transcript'
  if (!s.text) return 'not-clean'
  if (!s.reading) return 'not-analysed'
  if (
    s.lost > 0 ||
    s.text.rawImportedAt.getTime() > s.reading.rawImportedAt.getTime() ||
    s.reading.textAnalysed !== s.textAnalysed ||
    s.reading.anonymised !== s.anonymised
  )
    return 'to-analyse-again'
  return s.toDecide > 0 ? 'to-decide' : 'done'
}
