import { err, fixedClock, ok } from '@goodresearch/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeFolderWork } from '../application/commands/folder-work.ts'
import type { StudyFiles } from '../application/study-files.ts'
import {
  type DriveItem,
  FOLDER_MIME,
  SHORTCUT_MIME,
  TranscriptUnreadable,
} from '../domain/drive-gateway.ts'

const ada = { id: 'ada', role: 'member' as const }
const clock = fixedClock(new Date('2026-11-01T10:00:00Z'))

let items: Map<string, DriveItem>
let anonymised: boolean
let writable: boolean
let running: boolean
let refreshed: number
let log: string[]

const add = (id: string, name: string, parent: string, mimeType = 'text/plain') =>
  items.set(id, { id, name, mimeType, parents: [parent] })

const files = {
  folderId: 'root',
  item: async (id: string) => ok(items.get(id) ?? null),
  list: async (ids: readonly string[], max: number) =>
    ok([...items.values()].filter((i) => i.parents?.some((p) => ids.includes(p))).slice(0, max)),
  readStart: async (item: DriveItem, max: number) => {
    if (item.mimeType === 'video/mp4') throw new TranscriptUnreadable()
    return ok('x'.repeat(20_000).slice(0, max))
  },
  renameFile: async (id: string, name: string) => {
    const item = items.get(id)
    if (!item) return ok(null)
    if (name === 'Refused') return err('DRIVE_CANNOT_EDIT')
    items.set(id, { ...item, name })
    log.push(`rename ${id}`)
    return ok({})
  },
  moveFile: async (id: string, _from: readonly string[], to: string) => {
    const item = items.get(id)
    if (item) items.set(id, { ...item, parents: [to] })
    log.push(`move ${id}`)
    return ok(undefined)
  },
  createFolderIn: async (parent: string, name: string) => {
    const id = `new-${name}`
    items.set(id, { id, name, mimeType: FOLDER_MIME, parents: [parent] })
    log.push(`folder ${name}`)
    return ok({ id })
  },
} as unknown as StudyFiles

const work = () =>
  makeFolderWork(
    {
      clock,
      studies: { getStudyAccess: async () => ({ anonymised }) },
      store: {
        getSource: async () =>
          running
            ? {
                inventory: {
                  status: 'running',
                  startedAt: clock.now(),
                  progress: { updatedAt: clock.now() },
                },
              }
            : null,
      },
    } as never,
    async (_account, _study, access) =>
      access === 'write' && !writable ? err('DRIVE_WRITE_REQUIRED') : ok(files),
    async () => {
      refreshed++
    },
  )

beforeEach(() => {
  items = new Map([['root', { id: 'root', name: 'Study', mimeType: FOLDER_MIME }]])
  items.set('week', { id: 'week', name: 'Week 1', mimeType: FOLDER_MIME, parents: ['root'] })
  add('f1', 'Interview.txt', 'week')
  add('video', 'Interview.mp4', 'week', 'video/mp4')
  items.set('outside', { id: 'outside', name: 'Other', mimeType: FOLDER_MIME, parents: ['x'] })
  add('secret', 'Secret.txt', 'outside')
  anonymised = false
  writable = true
  running = false
  refreshed = 0
  log = []
})

describe('spec 024 — seeing the folder', () => {
  it('gives every level at once, with paths, inside the study folder only', async () => {
    expect(await work().browse(ada, 's1')).toMatchObject({
      ok: true,
      value: {
        cut: false,
        items: [
          { id: 'week', path: '', isFolder: true },
          { name: 'Interview.txt', path: 'Week 1', isFolder: false },
          { id: 'video', path: 'Week 1' },
        ],
      },
    })
    expect(await work().browse(ada, 's1', 'outside')).toEqual({
      ok: false,
      error: 'OUTSIDE_FOLDER',
    })
  })

  it('finds by name, without accents or capitals, and by kind, everywhere', async () => {
    add('nadia', 'Entretien Nadia Éléonore.txt', 'week')
    expect(await work().find(ada, 's1', { query: 'eleonore' })).toMatchObject({
      ok: true,
      value: { items: [{ id: 'nadia', path: 'Week 1' }] },
    })
    const videos = await work().find(ada, 's1', { kind: 'recording' })
    expect(videos).toMatchObject({ ok: true, value: { items: [{ id: 'video' }] } })
    expect(await work().find(ada, 's1', { query: 'secret' })).toMatchObject({
      value: { items: [] },
    })
  })

  it('says when the list is cut', async () => {
    for (let i = 0; i < 600; i++) add(`many${i}`, `File ${i}`, 'week')
    const found = await work().browse(ada, 's1')
    expect(found).toMatchObject({ ok: true, value: { cut: true } })
    if (found.ok) expect(found.value.items).toHaveLength(500)
  })

  it('tells nothing on a study set to anonymise names', async () => {
    anonymised = true
    expect(await work().browse(ada, 's1')).toEqual({ ok: false, error: 'STUDY_ANONYMISED' })
    expect(await work().read(ada, 's1', 'f1')).toEqual({ ok: false, error: 'STUDY_ANONYMISED' })
  })

  it('reads one extract at a time, and says when the file goes on', async () => {
    const first = await work().read(ada, 's1', 'f1')
    expect(first).toMatchObject({ ok: true, value: { name: 'Interview.txt', more: true } })
    if (first.ok) expect(first.value.text).toHaveLength(8_000)
    const last = await work().read(ada, 's1', 'f1', 3)
    expect(last).toMatchObject({ ok: true, value: { more: false } })
    if (last.ok) expect(last.value.text).toHaveLength(4_000)
  })

  it('reads the file behind a shortcut, and refuses one to a folder', async () => {
    items.set('short', {
      id: 'short',
      name: 'Link to notes',
      mimeType: SHORTCUT_MIME,
      parents: ['week'],
      shortcutTargetId: 'secret',
    })
    expect(await work().read(ada, 's1', 'short')).toMatchObject({
      ok: true,
      value: { name: 'Link to notes' },
    })
    items.set('short', { ...(items.get('short') as DriveItem), shortcutTargetId: 'week' })
    expect(await work().read(ada, 's1', 'short')).toEqual({ ok: false, error: 'UNREADABLE' })
  })

  it('refuses a file outside, a folder, and a format it cannot read', async () => {
    const read = (id: string) => work().read(ada, 's1', id)
    expect(await read('secret')).toEqual({ ok: false, error: 'OUTSIDE_FOLDER' })
    expect(await read('week')).toEqual({ ok: false, error: 'UNREADABLE' })
    expect(await read('video')).toEqual({ ok: false, error: 'UNREADABLE' })
  })
})

describe('spec 024 — changing the folder', () => {
  const lines = [
    { kind: 'new-folder', key: 'sort', name: 'To sort', parent: 'root' },
    { kind: 'move', fileId: 'video', to: 'sort' },
    { kind: 'rename', fileId: 'f1', name: 'Sam.txt' },
  ] as const

  it('shows each line before and after, and changes nothing', async () => {
    expect(await work().check(ada, 's1', lines)).toMatchObject({
      ok: true,
      value: {
        lines: [
          { kind: 'new-folder', after: 'Study / To sort' },
          {
            kind: 'move',
            before: 'Week 1 / Interview.mp4',
            after: 'To sort / Interview.mp4',
            dependsOn: 0,
          },
          { kind: 'rename', before: 'Interview.txt', after: 'Sam.txt' },
        ],
      },
    })
    expect(log).toEqual([])
  })

  it.each([
    ['a file outside', [{ kind: 'rename', fileId: 'secret', name: 'A' }]],
    ['a destination outside', [{ kind: 'move', fileId: 'f1', to: 'outside' }]],
    ['a parent outside', [{ kind: 'new-folder', key: 'a', name: 'A', parent: 'outside' }]],
    ['the study folder itself', [{ kind: 'rename', fileId: 'root', name: 'A' }]],
  ] as const)('refuses %s', async (_case, batch) => {
    expect(await work().check(ada, 's1', batch)).toEqual({ ok: false, error: 'OUTSIDE_FOLDER' })
  })

  it('refuses what could not run: a file as a destination, a folder into itself', async () => {
    expect(await work().check(ada, 's1', [{ kind: 'move', fileId: 'video', to: 'f1' }])).toEqual({
      ok: false,
      error: 'INVALID_CHANGES',
    })
    items.set('deep', { id: 'deep', name: 'Deep', mimeType: FOLDER_MIME, parents: ['week'] })
    expect(await work().check(ada, 's1', [{ kind: 'move', fileId: 'week', to: 'deep' }])).toEqual({
      ok: false,
      error: 'INVALID_CHANGES',
    })
  })

  it('says a file is gone, rather than outside', async () => {
    expect(await work().check(ada, 's1', [{ kind: 'rename', fileId: 'nope', name: 'A' }])).toEqual({
      ok: false,
      error: 'FILE_GONE',
    })
  })

  it('stops only the line that throws, and refuses to run under an inventory', async () => {
    const original = files.renameFile
    files.renameFile = (async (id: string, name: string) => {
      if (id === 'f1') throw new Error('Drive 500')
      return original(id, name)
    }) as StudyFiles['renameFile']
    expect(
      await work().apply(
        ada,
        's1',
        [
          { kind: 'rename', fileId: 'f1', name: 'A' },
          { kind: 'rename', fileId: 'video', name: 'B' },
        ],
        new Set(),
      ),
    ).toMatchObject({ value: { outcomes: ['DRIVE_UNAVAILABLE', 'done'] } })
    files.renameFile = original
    running = true
    expect(await work().apply(ada, 's1', lines, new Set())).toEqual({
      ok: false,
      error: 'INVENTORY_RUNNING',
    })
  })

  it('refuses two files ending with one name, and a running inventory', async () => {
    add('f2', 'Other.txt', 'week')
    expect(
      await work().check(ada, 's1', [
        { kind: 'rename', fileId: 'f1', name: 'Same' },
        { kind: 'rename', fileId: 'f2', name: 'Same' },
      ]),
    ).toEqual({ ok: false, error: 'NAME_CLASH' })
    running = true
    expect(await work().check(ada, 's1', lines)).toEqual({ ok: false, error: 'INVENTORY_RUNNING' })
  })

  it('refuses for the right to edit only once the batch is valid', async () => {
    writable = false
    expect(
      await work().check(ada, 's1', [{ kind: 'rename', fileId: 'secret', name: 'A' }]),
    ).toEqual({ ok: false, error: 'OUTSIDE_FOLDER' })
    expect(await work().check(ada, 's1', lines)).toEqual({
      ok: false,
      error: 'DRIVE_WRITE_REQUIRED',
    })
  })

  it('runs only what is kept, in order, with its outcome, then refreshes', async () => {
    expect(await work().apply(ada, 's1', lines, new Set([2]))).toEqual({
      ok: true,
      value: { outcomes: ['done', 'done', 'skipped'] },
    })
    expect(log).toEqual(['folder To sort', 'move video'])
    expect(items.get('video')?.parents).toEqual(['new-To sort'])
    expect(refreshed).toBe(1)
  })

  it('leaves out a line whose new folder is left out', async () => {
    expect(await work().apply(ada, 's1', lines, new Set([0]))).toMatchObject({
      value: { outcomes: ['skipped', 'skipped', 'done'] },
    })
    expect(log).toEqual(['rename f1'])
  })

  it('goes on after a line that fails, and does not refresh for nothing', async () => {
    const batch = [
      { kind: 'rename', fileId: 'f1', name: 'Refused' },
      { kind: 'rename', fileId: 'video', name: 'Good' },
    ] as const
    expect(await work().apply(ada, 's1', batch, new Set())).toMatchObject({
      value: { outcomes: ['DRIVE_CANNOT_EDIT', 'done'] },
    })
    refreshed = 0
    expect(
      await work().apply(ada, 's1', [{ kind: 'rename', fileId: 'secret', name: 'A' }], new Set()),
    ).toMatchObject({ value: { outcomes: ['OUTSIDE_FOLDER'] } })
    expect(refreshed).toBe(0)
    expect(items.get('secret')?.name).toBe('Secret.txt')
  })
})
