export type EvaluationState =
  | 'no-transcript'
  | 'not-clean'
  | 'speakers-not-identified'
  | 'not-measurable'
  | 'not-reviewed'
  | 'reviewing'
  | 'to-review-again'
  | 'reviewed'

/** Derived at each read (as spec 012's state): a word corrected alone does not mark it. */
export const evaluationState = (s: {
  readonly hasTranscript: boolean
  readonly measurable: boolean
  /** Absent: identified, as far as this caller knows. */
  readonly speakersIdentified?: boolean
  readonly reviewing: boolean
  readonly text: { readonly rawImportedAt: Date } | null
  readonly evaluation: {
    readonly rawImportedAt: Date
    readonly textAnalysed: string
    readonly anonymised: boolean
  } | null
  readonly textAnalysed: string
  readonly anonymised: boolean
  /** Remarks no longer found in the analysed text. */
  readonly lost: number
  /** Who counts as an interviewer changed: other sentences are theirs to read. */
  readonly interviewersChanged?: boolean
}): EvaluationState => {
  if (!s.hasTranscript) return 'no-transcript'
  if (!s.text) return 'not-clean'
  if (s.reviewing) return 'reviewing'
  if (s.speakersIdentified === false) return 'speakers-not-identified'
  if (!s.measurable) return 'not-measurable'
  if (!s.evaluation) return 'not-reviewed'
  if (
    s.lost > 0 ||
    s.interviewersChanged === true ||
    s.text.rawImportedAt.getTime() > s.evaluation.rawImportedAt.getTime() ||
    s.evaluation.textAnalysed !== s.textAnalysed ||
    s.evaluation.anonymised !== s.anonymised
  )
    return 'to-review-again'
  return 'reviewed'
}

export type ReviewAction = 'review' | 'review-again' | 'review-anyway'

/** What an interview's own row offers; none while it is read, or without a text to read. */
export const reviewActionOf = (state: EvaluationState): ReviewAction | null => {
  if (state === 'not-reviewed') return 'review'
  if (state === 'reviewed' || state === 'to-review-again') return 'review-again'
  return state === 'not-measurable' ? 'review-anyway' : null
}
