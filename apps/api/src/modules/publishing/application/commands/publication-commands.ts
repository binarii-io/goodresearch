import { err, ok, type Result } from '@goodresearch/shared'
import {
  applyToGuide,
  type GuideContent,
  guideItems,
  readGuide,
  renderGuide,
  validGuideItem,
} from '../../domain/guide.ts'
import { LABELS } from '../../domain/labels.ts'
import type { DocModel, Items, Language, TableModel } from '../../domain/model.ts'
import { practicesItems, renderPractices } from '../../domain/practices.ts'
import {
  appScheduleItems,
  type PlannedRow,
  type RowValue,
  readScheduleItems,
  renderSchedule,
  scheduleColumns,
  validRow,
} from '../../domain/schedule.ts'
import { acceptable, looksAccepted, same, threeWay } from '../../domain/three-way.ts'
import type {
  Actor,
  PublicationKind,
  PublishingDeps,
  StoredChange,
  StoredPublication,
  StudyFiles,
  StudyFilesError,
} from '../ports.ts'

export type PublishingError =
  | StudyFilesError
  | 'PUBLICATION_NOT_FOUND'
  | 'ALREADY_PUBLISHED'
  | 'DRIVE_CANNOT_EDIT'
  | 'DRIVE_CHANGED_MEANWHILE'
  | 'DRIVE_CHANGES_PENDING'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'

/** Checks run at most this often when the publications are listed (research R9). */
export const CHECK_EVERY_MS = 5 * 60 * 1000

/** A reservation older than this belongs to a publication that was interrupted. */
const RESERVATION_MS = 10 * 60 * 1000

type AppSide = {
  items: Items
  file: { doc: DocModel } | { table: TableModel }
  guide?: { content: GuideContent; version: number }
  rows?: (PlannedRow & { version: number })[]
}

const NAMES: Record<PublicationKind, 'guide' | 'practices' | 'schedule'> = {
  guide: 'guide',
  'best-practices': 'practices',
  schedule: 'schedule',
}

/**
 * Drive publishing of a study's preparation (spec 007): publish, check, decide on Drive changes,
 * update in place. Every file operation runs with the acting person's own access.
 */
export const makePublicationCommands = (deps: PublishingDeps) => {
  const now = () => deps.clock.now()

  /** The app side of a file: its current items and what would be written. */
  const appSide = async (
    actor: Actor,
    p: Pick<StoredPublication, 'kind' | 'studyId' | 'language' | 'timeZone'>,
  ): Promise<Result<AppSide | null, string>> => {
    const name = (await deps.reads.studyName(actor.id, p.studyId)) ?? ''
    if (p.kind === 'best-practices') {
      const doc = renderPractices(p.language)
      return ok({ items: practicesItems(doc), file: { doc } })
    }
    if (p.kind === 'guide') {
      const guide = await deps.reads.guide(actor.id, p.studyId)
      if (!guide.ok) return guide
      if (!guide.value) return ok(null)
      return ok({
        items: guideItems(guide.value.content),
        file: { doc: renderGuide(guide.value.content, name, p.language) },
        guide: guide.value,
      })
    }
    const rows = await deps.reads.schedule(actor.id, p.studyId)
    if (!rows.ok) return rows
    return ok({
      items: appScheduleItems(rows.value),
      file: { table: renderSchedule(rows.value, p.language, p.timeZone ?? 'UTC') },
      rows: rows.value,
    })
  }

  /** The file side: its items as read now, and the revision to rewrite it. */
  const fileSide = async (
    files: StudyFiles,
    p: Pick<StoredPublication, 'kind' | 'fileId' | 'language' | 'timeZone'>,
  ) => {
    if (p.kind === 'schedule') {
      const read = await files.readTable(p.fileId, {
        columns: scheduleColumns(p.language),
        timeZone: p.timeZone ?? 'UTC',
      })
      return read.ok
        ? ok({ items: readScheduleItems(read.value, p.language), revision: null })
        : read
    }
    const read = await files.readDocument(p.fileId)
    if (!read.ok) return read
    const items =
      p.kind === 'guide' ? guideItems(readGuide(read.value.doc)) : practicesItems(read.value.doc)
    return ok({ items, revision: read.value.revision })
  }

  const valid = (kind: PublicationKind) => (kind === 'schedule' ? validRow : validGuideItem)

  /**
   * Compares base, app and file and stores the state and the pending changes; decisions already
   * taken on the same Drive value are kept (a rejected change is not proposed again).
   */
  const recompute = async (
    actor: Actor,
    p: StoredPublication,
    drive: Items,
    meta: { version: number; revision: string | null; name?: string; lastEditor?: string | null },
    /** A check only records what it saw; a decision also changed the base. */
    write: 'check' | 'base' = 'check',
  ): Promise<Result<StoredPublication, string>> => {
    const app = await appSide(actor, p)
    if (!app.ok) return app
    const appItems = app.value?.items ?? new Map()
    const diff = threeWay(new Map(p.base), appItems, drive, valid(p.kind))
    const { outOfDate } = diff
    // A Drive value already decided on (rejected, or replaced by a final text) is not proposed
    // again: the next update replaces it.
    const stored = await deps.store.changes(p.id)
    const decided = stored.filter((c) => c.decision !== 'pending')
    // An unchanged change keeps its id: a review open in a browser still refers to it.
    const pendingBefore = stored.filter((c) => c.decision === 'pending')
    const acceptedAdditions = decided
      .filter((c) => c.decision === 'accepted' && /^new(-row)?:/.test(c.key))
      .map((c) => c.drive)
    // Unsure situations are shown, never offered for acceptance (PR #7 review): a heading that
    // lost its anchor (a section may still be there under another heading), a sheet whose id
    // column or other columns changed (rows may still be there), an addition that looks like one
    // already accepted (it has no identity in the file until the next update).
    const sectionsUnsure = [...drive.keys()].some((k) => k.startsWith('unread:section'))
    const rowsUnsure = drive.has('unread:structure')
    const changes = diff.changes.map((c) => {
      const unsure =
        (sectionsUnsure &&
          (c.kind === 'removed' || c.kind === 'reordered') &&
          (c.key.startsWith('section:') || c.key.startsWith('order:'))) ||
        (rowsUnsure &&
          (c.kind === 'removed' || c.kind === 'added') &&
          (c.key.startsWith('row:') || c.key.startsWith('new-row:'))) ||
        (c.kind === 'added' && looksAccepted(c.drive, acceptedAdditions))
      return unsure ? { ...c, kind: 'not-understood' as const } : c
    })
    const fresh: StoredChange[] = []
    let rejected = 0
    for (const c of changes) {
      const known = decided.find((d) => d.key === c.key && same(d.drive, c.drive))
      if (known) {
        rejected += 1
        continue
      }
      fresh.push({
        id:
          pendingBefore.find((d) => d.key === c.key && d.kind === c.kind && same(d.drive, c.drive))
            ?.id ?? deps.newId(),
        publicationId: p.id,
        key: c.key,
        kind: c.kind,
        base: c.base,
        app: c.app,
        drive: c.drive,
        decision: 'pending',
        decidedBy: null,
        decidedAt: null,
      })
    }
    const state = fresh.some((c) => c.kind === 'conflict')
      ? 'conflict'
      : fresh.length
        ? 'changed-in-drive'
        : outOfDate || rejected
          ? 'out-of-date'
          : 'in-sync'
    const next: StoredPublication = {
      ...p,
      drive: [...drive],
      checkedVersion: meta.version,
      checkedRevision: meta.revision,
      appVersion: app.value?.guide?.version ?? null,
      state,
      unavailableReason: null,
      lastCheckedAt: now(),
      ...(meta.name ? { fileName: meta.name } : {}),
      ...(meta.lastEditor !== undefined ? { lastEditor: meta.lastEditor } : {}),
    }
    // A check never writes back over an update or a decision made meanwhile: its changes and
    // state are recorded only while the base it compared against is still the stored one.
    if (write === 'base') {
      // Only on the base this decision started from: an update made meanwhile wins.
      if (await deps.store.saveBase(next, p.baseRev - 1))
        await deps.store.replacePending(p.id, fresh)
    } else await deps.store.saveCheck(next, fresh)
    return ok(next)
  }

  const load = async (actor: Actor, id: string, access: 'read' | 'write') => {
    const p = await deps.store.get(id)
    if (!p) return err('PUBLICATION_NOT_FOUND' as const)
    const files = await deps.files(actor.id, p.studyId, access)
    if (!files.ok)
      return files.error === 'STUDY_NOT_FOUND' ? err('PUBLICATION_NOT_FOUND' as const) : files
    return ok({ p, files: files.value })
  }

  /** Reads the file only when its version moved since the last read (research R9). */
  const checkWith = async (
    actor: Actor,
    p: StoredPublication,
    files: StudyFiles,
  ): Promise<
    Result<
      { publication: StoredPublication; canEdit: boolean; owner: string | null },
      PublishingError | string
    >
  > => {
    const meta = await files.metadata(p.fileId)
    if (!meta.ok) return meta
    const m = meta.value
    const unavailable = !m
      ? 'missing'
      : m.trashed
        ? 'trashed'
        : m.parents.includes(files.folderId)
          ? null
          : 'moved'
    if (unavailable || !m) {
      const next: StoredPublication = {
        ...p,
        state: 'unavailable',
        unavailableReason: unavailable,
        lastCheckedAt: now(),
      }
      // A file this person cannot open may be open to the rest of the team: only facts seen by
      // everyone (trashed, moved) change the shared state (PR #7 review).
      if (unavailable !== 'missing') await deps.store.saveCheck(next, null)
      // Only this person cannot open it: the team's state stays, the time of the check moves
      // (otherwise every visit would check it again).
      else await deps.store.touchChecked(p.id, now())
      return ok({ publication: next, canEdit: false, owner: null })
    }
    // Never read back after a write: nothing to compare; out of date until the next update.
    if (p.base.length === 0 && p.baseVersion === 0) {
      const next: StoredPublication = {
        ...p,
        state: 'out-of-date',
        unavailableReason: null,
        lastCheckedAt: now(),
        fileName: m.name,
        lastEditor: m.lastEditorName,
      }
      await deps.store.saveCheck(next, [])
      return ok({ publication: next, canEdit: m.canEdit, owner: m.ownerName })
    }
    let drive: Items
    let revision: string | null
    if (m.version === p.baseVersion) {
      drive = new Map(p.base)
      revision = p.baseRevision
    } else if (m.version === p.checkedVersion && p.drive) {
      drive = new Map(p.drive)
      revision = p.checkedRevision
    } else {
      const read = await fileSide(files, p)
      if (!read.ok) return read
      drive = read.value.items
      revision = read.value.revision
    }
    const next = await recompute(actor, p, drive, {
      version: m.version,
      revision,
      name: m.name,
      lastEditor: m.lastEditorName,
    })
    if (!next.ok) return next
    return ok({ publication: next.value, canEdit: m.canEdit, owner: m.ownerName })
  }

  /** Writes the app side to a new or existing file, reads it back and makes that the base. */
  const writeBase = async (
    files: StudyFiles,
    p: Pick<StoredPublication, 'kind' | 'fileId' | 'language' | 'timeZone'>,
  ) => {
    // The version first: an edit made while reading then shows as a newer version next time,
    // instead of hiding behind the version of the content read (PR #7 review).
    const meta = await files.metadata(p.fileId)
    if (!meta.ok) return meta
    const read = await fileSide(files, p)
    if (!read.ok) return read
    return ok({
      base: [...read.value.items],
      revision: read.value.revision,
      version: meta.value?.version ?? 0,
      name: meta.value?.name,
    })
  }

  return {
    publish: async (c: {
      actor: Actor
      studyId: string
      kinds: readonly PublicationKind[]
      language: Language
      timeZone: string
    }): Promise<Result<{ ids: string[] }, PublishingError | string>> => {
      const files = await deps.files(c.actor.id, c.studyId, 'write')
      if (!files.ok) return files
      const kinds = [...new Set(c.kinds)]
      // A reservation left by an interrupted publication (the server stopped meanwhile) is freed
      // after a while, so the element can be published again (PR #7 review).
      for (const p of await deps.store.listByStudy(c.studyId))
        if (p.fileId === '' && now().getTime() - p.publishedAt.getTime() > RESERVATION_MS)
          await deps.store.delete(p.id)
      const existing = await deps.store.listByStudy(c.studyId)
      if (kinds.some((k) => existing.some((p) => p.kind === k))) return err('ALREADY_PUBLISHED')
      const studyName = (await deps.reads.studyName(c.actor.id, c.studyId)) ?? ''
      const ids: string[] = []
      for (const kind of kinds) {
        const target = {
          kind,
          studyId: c.studyId,
          language: c.language,
          timeZone: kind === 'schedule' ? c.timeZone : null,
        }
        const app = await appSide(c.actor, target)
        if (!app.ok) return app
        // A guide is published once it exists (US1 scenario 4).
        if (!app.value) continue
        const name = `${studyName} · ${LABELS[c.language][NAMES[kind]]}`
        const at = now()
        // The (study, kind) slot is reserved before the file is created: two people publishing at
        // once create one file, not two (PR #7 review). Hidden from the lists until filled.
        const id = deps.newId()
        const reserved = await deps.store.insert({
          id,
          studyId: c.studyId,
          kind,
          fileId: '',
          fileName: name,
          webLink: '',
          language: c.language,
          timeZone: target.timeZone,
          base: [],
          baseVersion: 0,
          baseRevision: null,
          baseRev: 0,
          drive: null,
          checkedVersion: null,
          checkedRevision: null,
          appVersion: null,
          state: 'unavailable',
          unavailableReason: 'missing',
          lastCheckedAt: at,
          lastEditor: null,
          publishedBy: c.actor.id,
          publishedAt: at,
          updatedBy: c.actor.id,
          updatedAt: at,
        })
        if (!reserved) return err('ALREADY_PUBLISHED')
        const file = app.value.file
        // Whatever happens (an error, or the source failing), a reservation without a file is
        // freed; once the file exists it stays tracked, even if reading it back failed.
        let created: Awaited<ReturnType<StudyFiles['createDocument']>> | undefined
        try {
          created =
            'doc' in file
              ? await files.value.createDocument(name, file.doc)
              : await files.value.createTable(name, file.table)
        } finally {
          if (!created?.ok) await deps.store.delete(id)
        }
        if (!created.ok) return created
        const base = await writeBase(files.value, { ...target, fileId: created.value.id }).catch(
          () => null,
        )
        // Not read back: tracked with no base, shown out of date; updating writes and reads it.
        const read = base?.ok ? base.value : { base: [], revision: null, version: 0, name }
        // A file the source could not fill completely is kept and shown out of date too.
        const state = same(Object.fromEntries(read.base), Object.fromEntries(app.value.items))
          ? ('in-sync' as const)
          : ('out-of-date' as const)
        const publication: StoredPublication = {
          id,
          studyId: c.studyId,
          kind,
          fileId: created.value.id,
          fileName: read.name ?? name,
          webLink: created.value.webViewLink,
          language: c.language,
          timeZone: target.timeZone,
          base: read.base,
          baseVersion: read.version,
          baseRevision: read.revision,
          baseRev: 1,
          drive: read.base,
          checkedVersion: read.version,
          checkedRevision: read.revision,
          appVersion: app.value.guide?.version ?? null,
          state,
          unavailableReason: null,
          lastCheckedAt: at,
          lastEditor: null,
          publishedBy: c.actor.id,
          publishedAt: at,
          updatedBy: c.actor.id,
          updatedAt: at,
        }
        await deps.store.save(publication)
        ids.push(publication.id)
      }
      return ok({ ids })
    },

    check: async (c: { actor: Actor; publicationId: string }) => {
      const loaded = await load(c.actor, c.publicationId, 'read')
      if (!loaded.ok) return loaded
      return checkWith(c.actor, loaded.value.p, loaded.value.files)
    },

    /** Checks the publications of a study not checked recently (when the tab opens). */
    checkStale: async (c: { actor: Actor; studyId: string }) => {
      const list = await deps.store.listByStudy(c.studyId)
      const stale = list.filter(
        (p) =>
          p.fileId !== '' &&
          (!p.lastCheckedAt || now().getTime() - p.lastCheckedAt.getTime() > CHECK_EVERY_MS),
      )
      if (!stale.length) return
      const files = await deps.files(c.actor.id, c.studyId, 'read')
      if (!files.ok) return
      // Best effort and in parallel: a Drive hiccup never hides the stored publications.
      await Promise.allSettled(stale.map((p) => checkWith(c.actor, p, files.value)))
    },

    /**
     * Decisions on Drive changes (US3), each taken once. Accepted values are applied through the
     * research commands, against the app version the changes were computed on.
     */
    decide: async (c: {
      actor: Actor
      publicationId: string
      decisions: readonly { changeId: string; decision: 'accept' | 'reject'; final?: unknown }[]
    }): Promise<
      Result<
        { applied: number; rejected: number; alreadyDecided: number },
        PublishingError | string
      >
    > => {
      const loaded = await load(c.actor, c.publicationId, 'read')
      if (!loaded.ok) return loaded
      const { p } = loaded.value
      const all = await deps.store.changes(p.id)
      const accept = c.decisions.filter((d) => d.decision === 'accept')
      const known = (id: string) => all.find((x) => x.id === id)
      const typeOf = (v: unknown) => (v as { type?: string } | null | undefined)?.type
      // Only this publication's changes; not understood or invalid values cannot be accepted, nor
      // can the best practices come back; a final text only settles a guide conflict, with a value
      // of the same kind that the app's rules accept.
      if (c.decisions.some((d) => !known(d.changeId))) return err('VALIDATION')
      if (
        accept.some((d) => {
          const change = known(d.changeId)
          if (!change || !acceptable(change.kind) || p.kind === 'best-practices') return true
          if (!('final' in d) || d.final === undefined) return false
          const sectionOf = (v: unknown) => (v as { section?: unknown } | null | undefined)?.section
          return (
            p.kind !== 'guide' ||
            change.kind !== 'conflict' ||
            d.final === null ||
            typeOf(d.final) !== typeOf(change.drive ?? change.app) ||
            !valid(p.kind)(d.final) ||
            // A question stays in the section of one of the two versions.
            (typeOf(d.final) === 'question' &&
              sectionOf(d.final) !== sectionOf(change.drive) &&
              sectionOf(d.final) !== sectionOf(change.app))
          )
        })
      )
        return err('VALIDATION')
      const rejected = await deps.store.decide(
        p.id,
        c.decisions.filter((d) => d.decision === 'reject').map((d) => d.changeId),
        'rejected',
        c.actor.id,
        now(),
      )
      const claimed = await deps.store.decide(
        p.id,
        accept.map((d) => d.changeId),
        'accepted',
        c.actor.id,
        now(),
      )
      const value = (change: StoredChange) => {
        const final = accept.find((d) => d.changeId === change.id)?.final
        return final === undefined ? change.drive : final
      }
      const outcome = await applyChanges(c.actor, p, claimed, value)
      // What could not be applied goes back to the review; what was applied stays decided.
      const failed = claimed.filter((x) => !outcome.done.includes(x))
      if (failed.length) await deps.store.undecide(failed.map((x) => x.id))
      if (outcome.error && !outcome.done.length) {
        // The app or the file moved since the check: check again, so the review shows fresh values.
        await checkWith(c.actor, p, loaded.value.files)
        return err(outcome.error)
      }
      const fresh = await deps.store.get(p.id)
      // Accepted values are now in the app and in the file: they become the base, unless an update
      // rewrote the file meanwhile (its base already holds the app's values).
      const base = new Map(fresh?.base ?? p.base)
      for (const change of outcome.done) {
        const v = value(change)
        if (v === undefined) base.delete(change.key)
        else base.set(change.key, v)
      }
      if (fresh && fresh.baseRev === p.baseRev) {
        const next = await recompute(
          c.actor,
          { ...fresh, base: [...base], baseRev: fresh.baseRev + 1 },
          new Map(fresh.drive ?? fresh.base),
          {
            version: fresh.checkedVersion ?? fresh.baseVersion,
            revision: fresh.checkedRevision,
          },
          'base',
        )
        if (!next.ok) return next
      }
      if (outcome.error) return err(outcome.error)
      return ok({
        applied: outcome.done.length,
        rejected: rejected.length,
        alreadyDecided: c.decisions.length - claimed.length - rejected.length,
      })
    },

    /** Rewrites the same file with the app's content (US4), never over unreviewed Drive changes. */
    update: async (c: {
      actor: Actor
      publicationId: string
      replaceDriveChanges: boolean
    }): Promise<Result<StoredPublication, PublishingError | string>> => {
      const loaded = await load(c.actor, c.publicationId, 'write')
      if (!loaded.ok) return loaded
      const { p, files } = loaded.value
      const meta = await files.metadata(p.fileId)
      if (!meta.ok) return meta
      if (!meta.value || meta.value.trashed || !meta.value.parents.includes(files.folderId)) {
        // Out of the study folder: never written; the check marks it unavailable.
        await checkWith(c.actor, p, files)
        return err('PUBLICATION_NOT_FOUND')
      }
      if (!meta.value.canEdit) return err('DRIVE_CANNOT_EDIT')
      const pending = (await deps.store.changes(p.id)).filter((x) => x.decision === 'pending')
      if (pending.length && !c.replaceDriveChanges) return err('DRIVE_CHANGES_PENDING')
      // The file as it is now must be what the last check saw: otherwise someone edited it since,
      // and those edits must be reviewed first. The document is then rewritten only at the revision
      // just read (atomic); a spreadsheet has no such guard, the window is the time of one write.
      const current = await fileSide(files, p)
      if (!current.ok) return current
      // (A file never read back after its creation has nothing to compare: it is rewritten.)
      const neverRead = p.base.length === 0 && p.baseVersion === 0
      if (
        !neverRead &&
        !same(Object.fromEntries(current.value.items), Object.fromEntries(p.drive ?? p.base))
      ) {
        await checkWith(c.actor, p, files)
        return err('DRIVE_CHANGED_MEANWHILE')
      }
      const app = await appSide(c.actor, p)
      if (!app.ok) return app
      if (!app.value) return err('VALIDATION')
      const written =
        'doc' in app.value.file
          ? await files.rewriteDocument(p.fileId, app.value.file.doc, current.value.revision ?? '')
          : await files.rewriteTable(p.fileId, app.value.file.table)
      if (!written.ok) {
        if (written.error === 'DRIVE_CHANGED_MEANWHILE') await checkWith(c.actor, p, files)
        return written
      }
      const base = await writeBase(files, p).catch(() => null)
      await deps.store.clearChanges(p.id)
      if (!base?.ok) {
        // Written but not read back: the file holds the app's version; with no base, the next
        // check shows it out of date and the next update rewrites it, instead of taking the app's
        // own write for changes made in Drive (PR #7 review).
        await deps.store.saveBase(
          {
            ...p,
            base: [],
            baseVersion: 0,
            baseRevision: null,
            baseRev: p.baseRev + 1,
            drive: null,
            checkedVersion: null,
            checkedRevision: null,
            state: 'out-of-date',
            updatedBy: c.actor.id,
            updatedAt: now(),
          },
          p.baseRev,
        )
        return base ?? err('DRIVE_CHANGED_MEANWHILE')
      }
      const next: StoredPublication = {
        ...p,
        base: base.value.base,
        baseVersion: base.value.version,
        baseRevision: base.value.revision,
        baseRev: p.baseRev + 1,
        drive: base.value.base,
        checkedVersion: base.value.version,
        checkedRevision: base.value.revision,
        appVersion: app.value.guide?.version ?? null,
        state: 'in-sync',
        unavailableReason: null,
        lastCheckedAt: now(),
        updatedBy: c.actor.id,
        updatedAt: now(),
        ...(base.value.name ? { fileName: base.value.name } : {}),
      }
      if (!(await deps.store.saveBase(next, p.baseRev))) return err('VERSION_CONFLICT')
      return ok(next)
    },

    /** Forgets a publication; nothing changes in Drive (FR-010). */
    forget: async (c: {
      actor: Actor
      publicationId: string
    }): Promise<Result<void, PublishingError | string>> => {
      const p = await deps.store.get(c.publicationId)
      if (!p) return err('PUBLICATION_NOT_FOUND')
      // The study's team can forget a file it cannot reach any more (folder replaced or lost,
      // Drive not connected): only people outside the study are refused.
      const files = await deps.files(c.actor.id, p.studyId, 'read')
      if (!files.ok && files.error === 'STUDY_NOT_FOUND') return err('PUBLICATION_NOT_FOUND')
      await deps.store.delete(c.publicationId)
      return ok(undefined)
    },
  }

  /**
   * Accepted Drive values into the app, through the research commands (research R7): the guide in
   * one save; schedule rows one by one, telling which ones were applied before a failure.
   */
  async function applyChanges(
    actor: Actor,
    p: StoredPublication,
    claimed: readonly StoredChange[],
    value: (change: StoredChange) => unknown,
  ): Promise<{ done: StoredChange[]; error: string | null }> {
    if (!claimed.length) return { done: [], error: null }
    const app = await appSide(actor, p)
    if (!app.ok) return { done: [], error: app.error }
    if (p.kind === 'guide') {
      const guide = app.value?.guide
      if (!guide || guide.version !== p.appVersion) return { done: [], error: 'VERSION_CONFLICT' }
      const accepted = new Map(claimed.map((x) => [x.key, value(x)]))
      const saved = await deps.actions.saveGuide({
        actor,
        studyId: p.studyId,
        content: applyToGuide(guide.content, accepted),
        version: guide.version,
      })
      return saved.ok ? { done: [...claimed], error: null } : { done: [], error: saved.error }
    }
    const rows = new Map((app.value?.rows ?? []).map((r) => [r.id, r]))
    const done: StoredChange[] = []
    for (const change of claimed) {
      const v = value(change) as RowValue | undefined
      let result: { ok: true } | { ok: false; error: string }
      if (change.key.startsWith('row:')) {
        const id = change.key.slice(4)
        const row = rows.get(id)
        if (!row) {
          // Deleted in the app, edited in Drive, and Drive's version taken: it comes back.
          result =
            change.app === undefined && v
              ? await deps.actions.addPlanned({ actor, studyId: p.studyId, fields: fieldsOf(v) })
              : { ok: false, error: 'VERSION_CONFLICT' }
        } else if (!same(appScheduleItems([row]).get(change.key), change.app))
          // The app row changed since the check: decide again on fresh values.
          result = { ok: false, error: 'VERSION_CONFLICT' }
        else
          result = v
            ? await deps.actions.updatePlanned({
                actor,
                id,
                fields: fieldsOf(v),
                version: row.version,
              })
            : await deps.actions.deletePlanned({ actor, id })
      } else
        result = v
          ? await deps.actions.addPlanned({ actor, studyId: p.studyId, fields: fieldsOf(v) })
          : { ok: true }
      if (!result.ok) return { done, error: result.error }
      done.push(change)
    }
    return { done, error: null }
  }
}

const fieldsOf = (v: RowValue): Omit<PlannedRow, 'id'> => ({
  interviewee: v.interviewee,
  role: v.role,
  interviewers: v.interviewers,
  scheduledAt: v.scheduledAt,
  status: v.status ?? 'to-contact',
  notes: v.notes,
})

export type PublicationCommands = ReturnType<typeof makePublicationCommands>
