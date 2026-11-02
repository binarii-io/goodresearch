import { err, ok, type Result } from '@goodresearch/shared'

/**
 * One line of a batch of changes in a study's folder (spec 024). There is no way to express
 * deleting, trashing or sharing: those are not in this model on purpose (constitution VII).
 * `parent` and `to` name a folder by id, or by the `key` of an earlier new folder of the batch.
 */
export type FolderChangeLine =
  | {
      readonly kind: 'new-folder'
      readonly key: string
      readonly name: string
      readonly parent: string
    }
  | { readonly kind: 'rename'; readonly fileId: string; readonly name: string }
  | { readonly kind: 'move'; readonly fileId: string; readonly to: string }

export const MAX_FOLDER_CHANGES = 200

export type FolderChangesError = 'INVALID_CHANGES' | 'NAME_CLASH'

const NAME = (name: string) => {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 200 && !trimmed.includes('/')
}

/** The rules a batch must follow on its own, before any file is looked at. */
export const validateFolderChanges = (
  lines: readonly FolderChangeLine[],
): Result<void, FolderChangesError> => {
  if (lines.length < 1 || lines.length > MAX_FOLDER_CHANGES) return err('INVALID_CHANGES')
  const keys = new Set<string>()
  const newOnes = new Set<string>()
  for (const line of lines) {
    if (line.kind === 'move') {
      if (line.fileId === line.to) return err('INVALID_CHANGES')
      continue
    }
    if (!NAME(line.name)) return err('INVALID_CHANGES')
    if (line.kind !== 'new-folder') continue
    if (keys.has(line.key)) return err('INVALID_CHANGES')
    const place = `${line.parent}/${line.name.trim()}`
    if (newOnes.has(place)) return err('NAME_CLASH')
    newOnes.add(place)
    keys.add(line.key)
  }
  // A key names a folder to come: it cannot stand for an existing file.
  if (lines.some((l) => l.kind !== 'new-folder' && keys.has(l.fileId)))
    return err('INVALID_CHANGES')
  // A key must be declared before it is used, so the lines can run in their order.
  const seen = new Set<string>()
  for (const line of lines) {
    if (line.kind === 'new-folder') {
      if (keys.has(line.parent) && !seen.has(line.parent)) return err('INVALID_CHANGES')
      seen.add(line.key)
    }
    if (line.kind === 'move' && keys.has(line.to) && !seen.has(line.to))
      return err('INVALID_CHANGES')
  }
  return ok(undefined)
}

/** Where each named file ends up: two files cannot share a name in one place. */
export const clashes = (
  lines: readonly FolderChangeLine[],
  items: ReadonlyMap<string, { readonly name: string; readonly parent: string | null }>,
): boolean => {
  const touched = new Set(lines.flatMap((l) => (l.kind === 'new-folder' ? [] : [l.fileId])))
  const final = new Map<string, { name: string; parent: string | null }>()
  for (const id of touched) {
    const item = items.get(id)
    if (item) final.set(id, { ...item })
  }
  for (const line of lines) {
    if (line.kind === 'new-folder') continue
    const entry = final.get(line.fileId)
    if (!entry) continue
    if (line.kind === 'rename') entry.name = line.name.trim()
    else entry.parent = line.to
  }
  const places = [
    ...[...final.values()].map((f) => `${f.parent}/${f.name}`),
    ...lines.flatMap((l) => (l.kind === 'new-folder' ? [`${l.parent}/${l.name.trim()}`] : [])),
  ]
  return new Set(places).size !== places.length
}

/** The lines left out: those excluded, and those needing a new folder that is left out. */
export const withDependents = (
  lines: readonly FolderChangeLine[],
  excluded: ReadonlySet<number>,
): Set<number> => {
  const out = new Set(excluded)
  const keysOut = new Set<string>()
  lines.forEach((line, index) => {
    const needs = line.kind === 'new-folder' ? line.parent : line.kind === 'move' ? line.to : null
    if (needs !== null && keysOut.has(needs)) out.add(index)
    if (line.kind === 'new-folder' && out.has(index)) keysOut.add(line.key)
  })
  return out
}

/** The earlier line a line depends on, for the card; null when none. */
export const dependsOn = (lines: readonly FolderChangeLine[], index: number): number | null => {
  const line = lines[index]
  if (!line || line.kind === 'rename') return null
  const needs = line.kind === 'new-folder' ? line.parent : line.to
  const found = lines.findIndex((l) => l.kind === 'new-folder' && l.key === needs)
  return found === -1 ? null : found
}
