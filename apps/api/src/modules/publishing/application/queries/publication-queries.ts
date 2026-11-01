import { err, ok, type Result } from '@goodresearch/shared'
import type {
  Actor,
  PublicationKind,
  PublishingDeps,
  StoredChange,
  StoredPublication,
} from '../ports.ts'

const view = (
  p: StoredPublication,
  changes: readonly StoredChange[],
  names: ReadonlyMap<string, string>,
) => {
  const pending = changes.filter((c) => c.decision === 'pending')
  const name = (id: string | null) => (id ? (names.get(id) ?? null) : null)
  return {
    id: p.id,
    kind: p.kind,
    fileName: p.fileName,
    webLink: p.webLink,
    language: p.language,
    state: p.state,
    unavailableReason: p.unavailableReason,
    counts: {
      fromDrive: pending.filter(
        (c) => c.kind !== 'conflict' && c.kind !== 'not-understood' && c.kind !== 'invalid',
      ).length,
      conflicts: pending.filter((c) => c.kind === 'conflict').length,
      notUnderstood: pending.filter((c) => c.kind === 'not-understood' || c.kind === 'invalid')
        .length,
      rejected: changes.filter((c) => c.decision === 'rejected').length,
    },
    lastEditor: p.lastEditor,
    publishedBy: name(p.publishedBy),
    publishedAt: p.publishedAt.toISOString(),
    updatedBy: name(p.updatedBy),
    updatedAt: p.updatedAt.toISOString(),
    lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
  }
}

/** Views of publications with their changes and people's names, in two queries (PR #7 review). */
const views = async (deps: PublishingDeps, list: readonly StoredPublication[]) => {
  const changes = await deps.store.changesOf(list.map((p) => p.id))
  const names = await deps.store.accountNames([
    ...new Set(list.flatMap((p) => [p.publishedBy, p.updatedBy]).filter((id) => id !== null)),
  ])
  return list.map((p) =>
    view(
      p,
      changes.filter((c) => c.publicationId === p.id),
      names,
    ),
  )
}

export type PublicationView = ReturnType<typeof view>

/** Publications and Drive changes of a study (spec 007), for whoever can act on the study. */
export const makePublicationQueries = (deps: PublishingDeps) => ({
  list: async (actor: Actor, studyId: string): Promise<Result<PublicationView[], string>> => {
    // Same gate as the preparation itself: the project's team, then the study's folder.
    const allowed = await deps.reads.schedule(actor.id, studyId)
    if (!allowed.ok) return err(allowed.error)
    // A publication being created (its file not there yet) is not shown.
    const list = (await deps.store.listByStudy(studyId)).filter((p) => p.fileId !== '')
    return ok(await views(deps, list))
  },

  /** Spec 023: the documents of the study with a file; a reservation is not a publication. */
  publishedKinds: async (actor: Actor, studyId: string): Promise<string[]> => {
    const allowed = await deps.reads.schedule(actor.id, studyId)
    if (!allowed.ok) return []
    return (await deps.store.listByStudy(studyId)).filter((p) => p.fileId !== '').map((p) => p.kind)
  },

  /**
   * Spec 023: what publishing would create; nothing is written. The right to edit comes last, so
   * nobody is asked for it on a request refused anyway.
   */
  checkPublication: async (c: {
    actor: Actor
    studyId: string
    kinds: readonly PublicationKind[]
  }): Promise<Result<{ kinds: PublicationKind[] }, string>> => {
    if (c.kinds.includes('guide')) {
      const guide = await deps.reads.guide(c.actor.id, c.studyId)
      if (!guide.ok) return guide
      if (!guide.value) return err('GUIDE_MISSING')
    }
    const existing = await deps.store.listByStudy(c.studyId)
    const kinds = [...new Set(c.kinds)].filter(
      (k) => !existing.some((p) => p.kind === k && p.fileId !== ''),
    )
    if (!kinds.length) return err('NOTHING_TO_PUBLISH')
    const files = await deps.files(c.actor.id, c.studyId, 'write')
    return files.ok ? ok({ kinds }) : files
  },

  view: async (p: StoredPublication) => (await views(deps, [p]))[0] as PublicationView,

  changes: async (actor: Actor, publicationId: string): Promise<Result<StoredChange[], string>> => {
    const p = await deps.store.get(publicationId)
    if (!p) return err('PUBLICATION_NOT_FOUND')
    const allowed = await deps.reads.schedule(actor.id, p.studyId)
    if (!allowed.ok)
      return err(allowed.error === 'STUDY_NOT_FOUND' ? 'PUBLICATION_NOT_FOUND' : allowed.error)
    return ok(await deps.store.changes(p.id))
  },
})

export type PublicationQueries = ReturnType<typeof makePublicationQueries>
