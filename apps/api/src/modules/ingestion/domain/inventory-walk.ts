import { classifyFile, type FileKind } from './classify.ts'
import { type DriveItem, FOLDER_MIME, SHORTCUT_MIME } from './drive-gateway.ts'

export type InventoryFile = {
  readonly id: string
  readonly name: string
  readonly kind: FileKind
  readonly group: string
  readonly mimeType: string
  readonly size: number | null
  readonly modifiedAt: string | null
  readonly webViewLink: string
}

export type InventoryProgress = { readonly folders: number; readonly files: number }

export type InventorySource = {
  listChildren(
    parentIds: readonly string[],
  ): AsyncIterable<DriveItem[]> | Promise<Iterable<DriveItem[]>>
  getItem(id: string): Promise<DriveItem | null>
}

export const ROOT_GROUP = 'Root'
/** Folders listed per query (Drive accepts several parents OR-ed in one query). */
const PARENTS_PER_QUERY = 20

/**
 * Breadth-first walk of a folder tree (FR-012 to FR-014). The group of a file is its first-level
 * sub-folder (`Root` for direct children). Shortcuts are resolved and each target listed once;
 * shortcuts to folders are not followed, so cycles are impossible.
 */
export const walkInventory = async (
  rootId: string,
  source: InventorySource,
  onProgress?: (progress: InventoryProgress) => void,
): Promise<{ files: InventoryFile[]; folders: number; skipped: number }> => {
  const files = new Map<string, InventoryFile>()
  const groupOfFolder = new Map<string, string>([[rootId, ROOT_GROUP]])
  let pending = [rootId]
  let folders = 0
  let skipped = 0

  const add = (item: DriveItem, group: string) => {
    if (files.has(item.id)) return
    files.set(item.id, {
      id: item.id,
      name: item.name,
      kind: classifyFile(item),
      group,
      mimeType: item.mimeType,
      size: item.size ?? null,
      modifiedAt: item.modifiedTime ?? null,
      webViewLink: item.webViewLink ?? `https://drive.google.com/open?id=${item.id}`,
    })
  }

  while (pending.length > 0) {
    const next: string[] = []
    for (let i = 0; i < pending.length; i += PARENTS_PER_QUERY) {
      const batch = pending.slice(i, i + PARENTS_PER_QUERY)
      for await (const page of await source.listChildren(batch)) {
        for (const item of page) {
          const parent = item.parents?.find((p) => groupOfFolder.has(p))
          const parentGroup = parent ? groupOfFolder.get(parent) : undefined
          if (parentGroup === undefined || !parent) continue
          // Direct sub-folders of the root name the group of everything below them.
          const group = parent === rootId && item.mimeType === FOLDER_MIME ? item.name : parentGroup
          if (item.mimeType === FOLDER_MIME) {
            if (groupOfFolder.has(item.id)) continue
            groupOfFolder.set(item.id, group)
            next.push(item.id)
            folders++
          } else if (item.mimeType === SHORTCUT_MIME) {
            if (!item.shortcutTargetId || item.shortcutTargetMimeType === FOLDER_MIME) {
              skipped++
              continue
            }
            const target = files.has(item.shortcutTargetId)
              ? null
              : await source.getItem(item.shortcutTargetId)
            if (target && target.mimeType !== FOLDER_MIME && !target.trashed)
              add(target, parent === rootId ? ROOT_GROUP : parentGroup)
            else if (!files.has(item.shortcutTargetId)) skipped++
          } else {
            add(item, parent === rootId ? ROOT_GROUP : parentGroup)
          }
        }
        onProgress?.({ folders, files: files.size })
      }
    }
    pending = next
  }
  return { files: [...files.values()], folders, skipped }
}
