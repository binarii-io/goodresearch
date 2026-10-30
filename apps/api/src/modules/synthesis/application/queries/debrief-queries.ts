import { ok } from '@goodresearch/shared'
import { coversStudies, debriefDecks, publishedView } from '../debrief-deck.ts'
import type { SynthesisDeps } from '../ports.ts'
import { projectOf } from '../project.ts'

export const makeDebriefQueries = (deps: SynthesisDeps) => {
  /** FR-001: the deck in the person's language, built now; and its Google Slides copy. */
  const get = async (accountId: string, projectId: string, input: { withProposed: boolean }) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const language = await deps.sources.language(accountId)
    const published = await deps.store.getPublishedDeck(projectId)
    // The deck shown, and the deck as it would be published now (its own language and option),
    // from one read (review of PR #15).
    const same =
      !published ||
      (published.language === language && published.withProposed === input.withProposed)
    const [deck, asPublished] = await debriefDecks(deps, accountId, projectId, project.value, [
      { language, withProposed: input.withProposed },
      ...(published && !same ? [published] : []),
    ])
    if (!deck) throw new Error('no deck')
    const now = asPublished ?? deck
    // Built without some of its studies, it is another deck: neither "out of date" nor "in sync".
    const sameAccess = !published || coversStudies(now.openStudyIds, published.studyIds)
    const outOfDate = published && sameAccess ? now.fingerprint !== published.fingerprint : false
    return ok({
      language,
      slides: deck.slides,
      published: published ? await publishedView(deps, published) : null,
      outOfDate,
      /** The published deck was built from other studies than this person can open. */
      otherAccess: !sameAccess,
      folders: deck.studies
        .filter((s) => s.hasFolder)
        .map((s) => ({ studyId: s.id, name: s.name })),
      counts: deck.counts,
      takeawaysDraft: deck.takeawaysDraft,
    })
  }
  return { get }
}
