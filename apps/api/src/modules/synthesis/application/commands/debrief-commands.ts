import { err, ok } from '@goodresearch/shared'
import type { PublishedDeck } from '../../domain/debrief.ts'
import { presentationOf } from '../../domain/deck-pages.ts'
import { coversStudies, debriefDeck, publishedView } from '../debrief-deck.ts'
import type { SynthesisDeps } from '../ports.ts'
import { projectOf } from '../project.ts'

/** The name of the presentation in Drive, in its language. */
const fileName = (language: 'en' | 'fr', project: string) =>
  `${language === 'fr' ? 'Restitution' : 'Debrief'} – ${project}`

export const makeDebriefCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  /** FR-007: a new Google Slides presentation of the deck, in a folder of the project's studies. */
  const publish = async (
    accountId: string,
    projectId: string,
    input: { studyId: string; language: 'en' | 'fr'; withProposed: boolean },
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const study = project.value.studies.find((s) => s.id === input.studyId)
    if (!study) return err('STUDY_NOT_FOUND' as const)
    if (!study.access) return err('STUDY_ACCESS_REQUIRED' as const)
    const files = await deps.sources.deckFiles(accountId, input.studyId)
    if (!files.ok) return files
    const deck = await debriefDeck(deps, accountId, projectId, project.value, input)
    const created = await files.value.createPresentation(
      fileName(input.language, project.value.name),
      presentationOf(deck.slides, input.language),
    )
    if (!created.ok) return created
    const before = await deps.store.getPublishedDeck(projectId)
    const record: PublishedDeck = {
      projectId,
      fileId: created.value.id,
      folderId: files.value.folderId,
      studyId: input.studyId,
      link: created.value.webViewLink,
      language: input.language,
      withProposed: input.withProposed,
      // A file created but left empty is kept, shown out of date, to be updated (review of PR #15).
      fingerprint: created.value.written ? deck.fingerprint : '',
      studyIds: deck.openStudyIds,
      revision: created.value.revision,
      publishedBy: accountId,
      publishedAt: now(),
      version: (before?.version ?? 0) + 1,
    }
    await deps.store.savePublishedDeck(record, null)
    if (!created.value.written) return err('DECK_NOT_WRITTEN' as const)
    return ok(await publishedView(deps, record))
  }

  /**
   * FR-008, FR-009: the same file rewritten with the deck as it is now; changes made in Google
   * Slides meanwhile are replaced only when the person confirms (`replace`).
   */
  const update = async (accountId: string, projectId: string, input: { replace: boolean }) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const record = await deps.store.getPublishedDeck(projectId)
    if (!record) return err('DECK_NOT_PUBLISHED' as const)
    const deck = await debriefDeck(deps, accountId, projectId, project.value, record)
    // Built without some of the studies it was published from, it would drop them (FR-010); a
    // study added since, open to this person, is taken in.
    if (!coversStudies(deck.openStudyIds, record.studyIds))
      return err('DECK_ACCESS_DIFFERS' as const)
    const files = await deps.sources.deckFiles(accountId, record.studyId)
    if (!files.ok) return files
    const meta = await files.value.metadata(record.fileId)
    if (!meta.ok) return meta
    if (!meta.value || meta.value.trashed) return err('DECK_FILE_GONE' as const)
    if (!meta.value.canEdit)
      return err('DRIVE_CANNOT_EDIT' as const, { owner: meta.value.ownerName })
    // A revision not known (not read after the last write) is treated as a change: never
    // overwrite without asking (review of PR #15).
    if (record.revision === null && !input.replace) return err('DECK_CHANGED_IN_SLIDES' as const)
    // Claimed before writing: of two updates at once, the second writes nothing. Who published
    // and when change only once the file is written.
    const claimed: PublishedDeck = { ...record, fingerprint: '', version: record.version + 1 }
    if ((await deps.store.savePublishedDeck(claimed, record.version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    // The revision is checked in the write itself: an edit made in Slides, even meanwhile, is
    // replaced only once the person confirms (FR-009).
    const written = await files.value.rewritePresentation(
      record.fileId,
      presentationOf(deck.slides, record.language),
      input.replace ? null : record.revision,
    )
    if (!written.ok)
      return written.error === 'DRIVE_CHANGED_MEANWHILE'
        ? err('DECK_CHANGED_IN_SLIDES' as const)
        : written
    const next: PublishedDeck = {
      ...claimed,
      link: meta.value.webViewLink,
      fingerprint: deck.fingerprint,
      studyIds: deck.openStudyIds,
      revision: written.value.revision,
      publishedBy: accountId,
      publishedAt: now(),
      version: claimed.version + 1,
    }
    if ((await deps.store.savePublishedDeck(next, claimed.version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    return ok(await publishedView(deps, next))
  }

  return { publish, update }
}
