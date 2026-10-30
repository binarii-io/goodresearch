/** Spec 015 FR-008: the deck published to Google Slides; the file itself lives in Drive. */
export type PublishedDeck = {
  readonly projectId: string
  readonly fileId: string
  readonly folderId: string
  readonly studyId: string
  readonly link: string
  readonly language: 'en' | 'fr'
  readonly withProposed: boolean
  /** Of the deck as published: another one now means "out of date". */
  readonly fingerprint: string
  /** The studies it was built from, as its publisher could open them (FR-010). */
  readonly studyIds: readonly string[]
  /**
   * The presentation's content revision just after the app wrote it (FR-009): a later one is a
   * change made in Google Slides; sharing or renaming the file does not count. Null when unknown.
   */
  readonly revision: string | null
  readonly publishedBy: string
  readonly publishedAt: Date
  readonly version: number
}
