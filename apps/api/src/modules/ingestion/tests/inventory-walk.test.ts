import { describe, expect, it } from 'vitest'
import { type DriveItem, FOLDER_MIME, SHORTCUT_MIME } from '../domain/drive-gateway.ts'
import { walkInventory } from '../domain/inventory-walk.ts'

const folder = (id: string, name: string, parent: string): DriveItem => ({
  id,
  name,
  mimeType: FOLDER_MIME,
  parents: [parent],
})
const file = (id: string, name: string, parent: string, mimeType = 'video/mp4'): DriveItem => ({
  id,
  name,
  mimeType,
  parents: [parent],
  size: 10,
  modifiedTime: '2026-10-01T00:00:00Z',
  webViewLink: `https://drive.google.com/file/d/${id}`,
})
const shortcut = (
  id: string,
  target: string,
  targetMimeType: string,
  parent: string,
): DriveItem => ({
  id,
  name: `shortcut-${target}`,
  mimeType: SHORTCUT_MIME,
  parents: [parent],
  shortcutTargetId: target,
  shortcutTargetMimeType: targetMimeType,
})

/** A tiny in-memory tree driven through the same callbacks as the Drive adapter. */
const tree = (items: DriveItem[], elsewhere: DriveItem[] = []) => ({
  listChildren: async (parentIds: readonly string[]) => [
    items.filter((i) => i.parents?.some((p) => parentIds.includes(p))),
  ],
  getItem: async (id: string) => [...items, ...elsewhere].find((i) => i.id === id) ?? null,
})

describe('walkInventory', () => {
  it('lists every file with its first-level group, Root for direct children', async () => {
    const result = await walkInventory(
      'root',
      tree([
        file('f1', 'intro.mp4', 'root'),
        folder('d1', 'Finance', 'root'),
        file('f2', 'call.mp4', 'd1'),
        folder('d2', 'Transcripts', 'd1'),
        file('f3', 'notes.txt', 'd2', 'text/plain'),
      ]),
    )
    expect(result.files.map((f) => [f.name, f.group, f.kind])).toEqual([
      ['intro.mp4', 'Root', 'media'],
      ['call.mp4', 'Finance', 'media'],
      ['notes.txt', 'Finance', 'transcript'],
    ])
    expect(result.folders).toBe(2) // sub-folders, the root excluded
  })

  it('resolves shortcuts once, even when the target is also in the folder', async () => {
    const result = await walkInventory(
      'root',
      tree(
        [
          file('f1', 'a.mp4', 'root'),
          shortcut('s1', 'f1', 'video/mp4', 'root'),
          shortcut('s2', 'x1', 'audio/mpeg', 'root'),
        ],
        [file('x1', 'outside.mp3', 'other', 'audio/mpeg')],
      ),
    )
    expect(result.files.map((f) => f.id).sort()).toEqual(['f1', 'x1'])
  })

  it('does not follow shortcuts to folders (no cycles)', async () => {
    const result = await walkInventory(
      'root',
      tree([folder('d1', 'A', 'root'), shortcut('s1', 'root', FOLDER_MIME, 'd1')]),
    )
    expect(result.files).toEqual([])
    expect(result.skipped).toBe(1)
  })

  it('skips shortcut targets that cannot be read', async () => {
    const result = await walkInventory(
      'root',
      tree([shortcut('s1', 'missing', 'video/mp4', 'root')]),
    )
    expect(result.files).toEqual([])
    expect(result.skipped).toBe(1)
  })

  it('reports progress and handles 10,000 files', async () => {
    const items: DriveItem[] = []
    for (let d = 0; d < 20; d++) {
      items.push(folder(`d${d}`, `Group ${d}`, 'root'))
      for (let f = 0; f < 500; f++) items.push(file(`f${d}-${f}`, `file ${f}.mp4`, `d${d}`))
    }
    const progress: number[] = []
    const result = await walkInventory('root', tree(items), (p) => progress.push(p.files))
    expect(result.files).toHaveLength(10_000)
    expect(progress.at(-1)).toBe(10_000)
  })
})
