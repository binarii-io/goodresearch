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
    form:
      p.kind === 'questionnaire'
        ? {
            linkedSheetLink: p.linkedSheetLink,
            responderLink: p.responderLink,
            openedBy: name(p.openedBy),
            openedAt: p.openedAt?.toISOString() ?? null,
            closedBy: name(p.closedBy),
            closedAt: p.closedAt?.toISOString() ?? null,
            acceptingResponses: p.acceptingResponses === true,
            collectsIdentity: p.collectsIdentity === true,
          }
        : null,
  }
}

/** Views of publications with their changes and people's names, in two queries (PR #7 review). */
const views = async (deps: PublishingDeps, list: readonly StoredPublication[]) => {
  const changes = await deps.store.changesOf(list.map((p) => p.id))
  const names = await deps.store.accountNames([
    ...new Set(
      list
        .flatMap((p) => [p.publishedBy, p.updatedBy, p.openedBy, p.closedBy])
        .filter((id) => id !== null),
    ),
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
export const makePublicationQueries = (deps: PublishingDeps) => {
  // Same gate as the preparation itself: the project's team, then the study's folder. A survey
  // study has no schedule: its questionnaire says the same (spec 027); a usability test study,
  // its protocol (spec 036).
  const gate = async (actor: Actor, studyId: string) => {
    const schedule = await deps.reads.schedule(actor.id, studyId)
    if (schedule.ok || schedule.error !== 'NOT_AN_INTERVIEW_STUDY') return schedule
    const questionnaire = await deps.reads.questionnaire(actor.id, studyId)
    return questionnaire.ok || questionnaire.error !== 'NOT_A_SURVEY_STUDY'
      ? questionnaire
      : deps.reads.protocol(actor.id, studyId)
  }
  return {
    list: async (actor: Actor, studyId: string): Promise<Result<PublicationView[], string>> => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return err(allowed.error)
      // A publication being created (its file not there yet) is not shown.
      const list = (await deps.store.listByStudy(studyId)).filter((p) => p.fileId !== '')
      return ok(await views(deps, list))
    },

    /** Spec 023: the documents of the study with a file; a reservation is not a publication. */
    publishedKinds: async (actor: Actor, studyId: string): Promise<string[]> => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return []
      return (await deps.store.listByStudy(studyId))
        .filter((p) => p.fileId !== '')
        .map((p) => p.kind)
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
      // The interview documents only belong to an interview study: its guide read says so. The
      // best practices also belong to a usability test study, with their own content (spec 036).
      if (c.kinds.includes('guide') || c.kinds.includes('best-practices')) {
        const guide = await deps.reads.guide(c.actor.id, c.studyId)
        const protocol =
          !guide.ok && !c.kinds.includes('guide')
            ? await deps.reads.protocol(c.actor.id, c.studyId)
            : null
        if (!guide.ok && !protocol?.ok)
          return protocol &&
            !protocol.ok &&
            guide.error === 'NOT_AN_INTERVIEW_STUDY' &&
            protocol.error !== 'NOT_A_USABILITY_TEST_STUDY'
            ? protocol
            : guide
        if (c.kinds.includes('guide') && guide.ok && !guide.value) return err('GUIDE_MISSING')
      }
      if (c.kinds.includes('protocol') || c.kinds.includes('participant-sheet')) {
        const protocol = await deps.reads.protocol(c.actor.id, c.studyId)
        if (!protocol.ok) return protocol
        if (!protocol.value) return err('PROTOCOL_NOT_FOUND')
      }
      if (c.kinds.includes('questionnaire')) {
        const questionnaire = await deps.reads.questionnaire(c.actor.id, c.studyId)
        if (!questionnaire.ok) return questionnaire
        if (!questionnaire.value) return err('QUESTIONNAIRE_NOT_FOUND')
      }
      const existing = await deps.store.listByStudy(c.studyId)
      // The protocol brings its participant sheet: a sheet forgotten alone is published again.
      const asked: PublicationKind[] = c.kinds.includes('protocol')
        ? [...c.kinds, 'participant-sheet']
        : [...c.kinds]
      const kinds = [...new Set(asked)].filter(
        (k) => !existing.some((p) => p.kind === k && p.fileId !== ''),
      )
      if (!kinds.length) return err('NOTHING_TO_PUBLISH')
      const files = await deps.files(c.actor.id, c.studyId, 'write')
      return files.ok ? ok({ kinds }) : files
    },

    view: async (p: StoredPublication) => (await views(deps, [p]))[0] as PublicationView,

    changes: async (
      actor: Actor,
      publicationId: string,
    ): Promise<Result<StoredChange[], string>> => {
      const p = await deps.store.get(publicationId)
      if (!p) return err('PUBLICATION_NOT_FOUND')
      const allowed = await gate(actor, p.studyId)
      if (!allowed.ok)
        return err(allowed.error === 'STUDY_NOT_FOUND' ? 'PUBLICATION_NOT_FOUND' : allowed.error)
      return ok(await deps.store.changes(p.id))
    },
  }
}

export type PublicationQueries = ReturnType<typeof makePublicationQueries>
