export type CleaningState =
  | 'no-transcript'
  | 'not-cleaned'
  | 'to-redo'
  | 'to-decide'
  | 'lexicon-changed'
  | 'clean'
  | 'published'
  | 'out-of-date'

/**
 * Spec 011 research R7: the state of an interview's cleaning, derived each time.
 * - to redo: its raw version was imported again after the last cleaning, or the study's
 *   anonymisation is not the one that cleaning ran with;
 * - to decide: corrections left, or none but no clean version yet (to validate);
 * - lexicon changed: the corrections that apply now differ from the latest clean version.
 */
export const cleaningState = (s: {
  /** When the raw version was imported; null without transcript. */
  readonly importedAt: Date | null
  readonly cleaning: { readonly cleanedAt: Date; readonly anonymised: boolean } | null
  readonly latest: {
    readonly number: number
    readonly rawImportedAt: Date
    readonly fingerprint: string
  } | null
  readonly anonymised: boolean
  readonly toDecide: number
  /** Of the corrections that apply now. */
  readonly fingerprint: string
  readonly published: { readonly versionNumber: number } | null
}): CleaningState => {
  if (!s.importedAt) return 'no-transcript'
  if (!s.cleaning && !s.latest) return 'not-cleaned'
  const since = s.cleaning?.cleanedAt ?? s.latest?.rawImportedAt
  if (
    (since && s.importedAt.getTime() > since.getTime()) ||
    (s.cleaning && s.cleaning.anonymised !== s.anonymised)
  )
    return 'to-redo'
  if (s.toDecide > 0 || !s.latest) return 'to-decide'
  if (s.latest.fingerprint !== s.fingerprint) return 'lexicon-changed'
  if (!s.published) return 'clean'
  return s.published.versionNumber < s.latest.number ? 'out-of-date' : 'published'
}
