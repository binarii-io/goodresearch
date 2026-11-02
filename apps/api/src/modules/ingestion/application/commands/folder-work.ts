import { err, ok, type Result } from '@goodresearch/shared'
import { classifyFile } from '../../domain/classify.ts'
import { FOLDER_MIME, SHORTCUT_MIME, TranscriptUnreadable } from '../../domain/drive-gateway.ts'
import {
  clashes,
  dependsOn,
  type FolderChangeLine,
  validateFolderChanges,
  withDependents,
} from '../../domain/folder-changes.ts'
import { isActiveRun } from '../../domain/inventory-run.ts'
import type { Actor, IngestionDeps } from '../ports.ts'
import type { makeStudyFiles, StudyFiles } from '../study-files.ts'

export const EXTRACT_CHARS = 8_000
const MAX_LISTED = 500
const MAX_DEPTH = 20
const PARENTS_AT_ONCE = 50
const MAX_FOUND = 50

export type FileSearchKind = 'transcript' | 'recording' | 'document' | 'folder'

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const kindOf = (item: FolderItem): FileSearchKind => {
  if (item.isFolder) return 'folder'
  if (classifyFile(item) === 'media') return 'recording'
  return classifyFile(item) === 'transcript' ? 'transcript' : 'document'
}

export type FolderItem = {
  id: string
  name: string
  /** The folders above it, inside the one opened. */
  path: string
  isFolder: boolean
  /** A shortcut in the folder: reading it reads the file it points to. */
  isShortcut: boolean
  mimeType: string
  size: number | null
  modifiedAt: string | null
}

export type PreviewLine = {
  index: number
  kind: FolderChangeLine['kind']
  before: string
  after: string
  dependsOn: number | null
}

export type LineOutcome = 'done' | 'skipped' | string

/**
 * What the assistant does in a study's folder (spec 024), with the person's own access. The model
 * sends the ids: each is checked to be inside the study's folder before anything is told or done.
 */
export const makeFolderWork = (
  deps: Pick<IngestionDeps, 'studies' | 'store' | 'clock'>,
  studyFiles: ReturnType<typeof makeStudyFiles>,
  refreshInventory: (c: { actor: Actor; studyId: string }) => Promise<unknown>,
) => {
  /** The study's files; a study set to anonymise names keeps them away from the assistant. */
  const open = async (
    actor: Actor,
    studyId: string,
    access: 'read' | 'write',
  ): Promise<Result<StudyFiles, string>> => {
    const study = await deps.studies.getStudyAccess(actor.id, studyId)
    if (!study) return err('STUDY_NOT_FOUND')
    if (study.anonymised) return err('STUDY_ANONYMISED')
    return studyFiles(actor.id, studyId, access)
  }

  /**
   * The folders above an item, nearest first; null when it is not in the study's folder. A file
   * gone and a lost connection say so: they are not the same as being outside.
   */
  const ancestors = async (
    files: StudyFiles,
    id: string,
  ): Promise<Result<string[] | null, string>> => {
    const above: string[] = []
    let current = id
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      if (current === files.folderId) return ok(above)
      const item = await files.item(current)
      if (!item.ok) return item
      if (!item.value || item.value.trashed) return depth === 0 ? err('FILE_GONE') : ok(null)
      const parent = item.value.parents?.[0]
      if (!parent) return ok(null)
      above.push(parent)
      current = parent
    }
    return ok(null)
  }

  /** An error when the item is not usable; null when it is inside the study's folder. */
  const refusalFor = async (files: StudyFiles, id: string): Promise<string | null> => {
    const above = await ancestors(files, id)
    if (!above.ok) return above.error
    return above.value ? null : 'OUTSIDE_FOLDER'
  }

  const tree = async (
    files: StudyFiles,
    target: string,
  ): Promise<Result<{ items: FolderItem[]; cut: boolean }, string>> => {
    // All levels at once: opening folders one by one would take the model one step each.
    const found: FolderItem[] = []
    const paths = new Map([[target, '']])
    let level = [target]
    for (let depth = 0; depth < MAX_DEPTH && level.length > 0; depth++) {
      const next: string[] = []
      for (let i = 0; i < level.length; i += PARENTS_AT_ONCE) {
        const parents = level.slice(i, i + PARENTS_AT_ONCE)
        const listed = await files.list(parents, MAX_LISTED + 1 - found.length)
        if (!listed.ok) return listed
        for (const item of listed.value) {
          const parent = item.parents?.find((p) => paths.has(p))
          const path = parent ? (paths.get(parent) ?? '') : ''
          const isFolder = item.mimeType === FOLDER_MIME
          found.push({
            id: item.id,
            name: item.name,
            path,
            isFolder,
            isShortcut: item.mimeType === SHORTCUT_MIME,
            mimeType: item.shortcutTargetMimeType ?? item.mimeType,
            size: item.size ?? null,
            modifiedAt: item.modifiedTime ?? null,
          })
          if (isFolder) {
            paths.set(item.id, path ? `${path} / ${item.name}` : item.name)
            next.push(item.id)
          }
        }
        if (found.length > MAX_LISTED) return ok({ items: found.slice(0, MAX_LISTED), cut: true })
      }
      level = next
    }
    return ok({ items: found, cut: false })
  }

  return {
    /** Spec 024: whether the assistant can work in this folder at all; asked before any consent. */
    available: async (actor: Actor, studyId: string): Promise<Result<void, string>> => {
      const files = await open(actor, studyId, 'read')
      return files.ok ? ok(undefined) : files
    },

    browse: async (
      actor: Actor,
      studyId: string,
      folderId?: string,
    ): Promise<Result<{ items: FolderItem[]; cut: boolean }, string>> => {
      const files = await open(actor, studyId, 'read')
      if (!files.ok) return files
      const target = folderId ?? files.value.folderId
      const refused = await refusalFor(files.value, target)
      if (refused) return err(refused)
      return tree(files.value, target)
    },

    /** Spec 024: what matches a name or a kind, anywhere in the folder; at most 50 items. */
    find: async (
      actor: Actor,
      studyId: string,
      search: { query?: string | undefined; kind?: FileSearchKind | undefined },
    ): Promise<Result<{ items: FolderItem[]; cut: boolean }, string>> => {
      const files = await open(actor, studyId, 'read')
      if (!files.ok) return files
      const all = await tree(files.value, files.value.folderId)
      if (!all.ok) return all
      const query = plain(search.query ?? '')
      const found = all.value.items.filter(
        (item) =>
          plain(item.name).includes(query) && (!search.kind || kindOf(item) === search.kind),
      )
      return ok({
        items: found.slice(0, MAX_FOUND),
        cut: all.value.cut || found.length > MAX_FOUND,
      })
    },

    /** One extract; the source is read up to the end of it, nothing further. */
    read: async (
      actor: Actor,
      studyId: string,
      fileId: string,
      part = 1,
    ): Promise<Result<{ name: string; text: string; more: boolean }, string>> => {
      const files = await open(actor, studyId, 'read')
      if (!files.ok) return files
      const refused = await refusalFor(files.value, fileId)
      if (refused) return err(refused)
      const item = await files.value.item(fileId)
      if (!item.ok) return item
      // A shortcut in the folder stands for its file, as in the inventory (spec 002).
      const target =
        item.value?.mimeType === SHORTCUT_MIME && item.value.shortcutTargetId
          ? await files.value.item(item.value.shortcutTargetId)
          : item
      if (!target.ok) return target
      if (!item.value || !target.value || target.value.mimeType === FOLDER_MIME)
        return err('UNREADABLE')
      const end = part * EXTRACT_CHARS
      try {
        const text = await files.value.readStart(target.value, end + 1)
        if (!text.ok) return text
        if (text.value === null) return err('UNREADABLE')
        return ok({
          name: item.value.name,
          text: text.value.slice(end - EXTRACT_CHARS, end),
          more: text.value.length > end,
        })
      } catch (error) {
        if (error instanceof TranscriptUnreadable) return err('UNREADABLE')
        throw error
      }
    },

    /** What a batch would do, line by line; nothing changes. The right to edit is asked last. */
    check: async (
      actor: Actor,
      studyId: string,
      lines: readonly FolderChangeLine[],
    ): Promise<Result<{ lines: PreviewLine[] }, string>> => {
      const valid = validateFolderChanges(lines)
      if (!valid.ok) return valid
      const files = await open(actor, studyId, 'read')
      if (!files.ok) return files
      const source = await deps.store.getSource(studyId)
      if (source && isActiveRun(source.inventory, deps.clock.now())) return err('INVENTORY_RUNNING')
      const keys = new Map(
        lines.flatMap((l) => (l.kind === 'new-folder' ? [[l.key, l.name.trim()] as const] : [])),
      )
      const items = new Map<string, { name: string; parent: string | null }>()
      const known = new Map<string, { name: string; isFolder: boolean }>()
      /** An item of the folder, read once; a string is the reason it cannot be used. */
      const look = async (id: string): Promise<{ name: string; isFolder: boolean } | string> => {
        const seen = known.get(id)
        if (seen) return seen
        const refused = await refusalFor(files.value, id)
        if (refused) return refused
        const item = await files.value.item(id)
        if (!item.ok) return item.error
        if (!item.value) return 'FILE_GONE'
        const found = { name: item.value.name, isFolder: item.value.mimeType === FOLDER_MIME }
        known.set(id, found)
        items.set(id, { name: item.value.name, parent: item.value.parents?.[0] ?? null })
        return found
      }
      /** The name of a folder: one of this batch, or one of the study's folder. */
      const folderName = async (id: string): Promise<string | { refused: string }> => {
        const key = keys.get(id)
        if (key !== undefined) return key
        const found = await look(id)
        if (typeof found === 'string') return { refused: found }
        return found.isFolder ? found.name : { refused: 'INVALID_CHANGES' }
      }
      const preview: PreviewLine[] = []
      for (const [index, line] of lines.entries()) {
        const shared = { index, kind: line.kind, dependsOn: dependsOn(lines, index) }
        if (line.kind === 'new-folder') {
          const parent = await folderName(line.parent)
          if (typeof parent !== 'string') return err(parent.refused)
          preview.push({ ...shared, before: parent, after: `${parent} / ${line.name.trim()}` })
          continue
        }
        if (line.fileId === files.value.folderId) return err('OUTSIDE_FOLDER')
        const found = await look(line.fileId)
        if (typeof found === 'string') return err(found)
        if (line.kind === 'rename') {
          preview.push({ ...shared, before: found.name, after: line.name.trim() })
          continue
        }
        const to = await folderName(line.to)
        if (typeof to !== 'string') return err(to.refused)
        // A folder cannot go inside itself.
        if (!keys.has(line.to)) {
          const above = await ancestors(files.value, line.to)
          if (!above.ok) return above
          if (above.value?.includes(line.fileId)) return err('INVALID_CHANGES')
        }
        const from = items.get(line.fileId)?.parent ?? null
        const fromName = from ? await folderName(from) : ''
        const shownFrom = typeof fromName === 'string' ? fromName : ''
        preview.push({
          ...shared,
          before: `${shownFrom} / ${found.name}`,
          after: `${to} / ${found.name}`,
        })
      }
      if (clashes(lines, items)) return err('NAME_CLASH')
      const editing = await open(actor, studyId, 'write')
      if (!editing.ok) return editing
      return ok({ lines: preview })
    },

    /** Runs the lines kept, in order; each gives its outcome, and a failure stops only itself. */
    apply: async (
      actor: Actor,
      studyId: string,
      lines: readonly FolderChangeLine[],
      excluded: ReadonlySet<number>,
    ): Promise<Result<{ outcomes: LineOutcome[] }, string>> => {
      const files = await open(actor, studyId, 'write')
      if (!files.ok) return files
      // Started since the card was shown: the lines would run under a scan that misses them.
      const running = await deps.store.getSource(studyId)
      if (running && isActiveRun(running.inventory, deps.clock.now()))
        return err('INVENTORY_RUNNING')
      const out = withDependents(lines, excluded)
      const created = new Map<string, string>()
      const failedKeys = new Set<string>()
      const outcomes: LineOutcome[] = []
      const resolve = (id: string) => created.get(id) ?? id
      for (const [index, line] of lines.entries()) {
        if (out.has(index)) {
          outcomes.push('skipped')
          continue
        }
        // A failure stops only its own line, whatever it is: what ran before stays told.
        outcomes.push(await runLine(line).catch(() => 'DRIVE_UNAVAILABLE'))
      }
      async function runLine(line: FolderChangeLine): Promise<LineOutcome> {
        if (!files.ok) return 'DRIVE_UNAVAILABLE'
        const f = files.value
        if (line.kind === 'new-folder') {
          if (failedKeys.has(line.parent)) {
            failedKeys.add(line.key)
            return 'FILE_GONE'
          }
          const refused = await refusalFor(f, resolve(line.parent))
          const made = refused
            ? null
            : await f.createFolderIn(resolve(line.parent), line.name.trim())
          if (made?.ok) {
            created.set(line.key, made.value.id)
            return 'done'
          }
          failedKeys.add(line.key)
          return made ? made.error : (refused ?? 'OUTSIDE_FOLDER')
        }
        if (line.fileId === f.folderId) return 'OUTSIDE_FOLDER'
        const refused = await refusalFor(f, line.fileId)
        if (refused) return refused
        if (line.kind === 'rename') {
          const renamed = await f.renameFile(line.fileId, line.name.trim())
          if (!renamed.ok) return renamed.error
          return renamed.value ? 'done' : 'FILE_GONE'
        }
        if (failedKeys.has(line.to)) return 'FILE_GONE'
        const to = resolve(line.to)
        const outside = await refusalFor(f, to)
        if (outside) return outside
        const item = await f.item(line.fileId)
        if (!item.ok) return item.error
        if (!item.value) return 'FILE_GONE'
        const moved = await f.moveFile(line.fileId, item.value.parents ?? [], to)
        return moved.ok ? 'done' : moved.error
      }
      // The changes are made: a refresh that cannot start leaves it to the next one.
      if (outcomes.includes('done'))
        await refreshInventory({ actor, studyId }).catch(() => undefined)
      return ok({ outcomes })
    },
  }
}

export type FolderWork = ReturnType<typeof makeFolderWork>
