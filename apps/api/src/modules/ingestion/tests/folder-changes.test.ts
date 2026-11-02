import { describe, expect, it } from 'vitest'
import {
  clashes,
  dependsOn,
  type FolderChangeLine,
  validateFolderChanges,
  withDependents,
} from '../domain/folder-changes.ts'

const folder = (key: string, parent = 'root', name = 'To sort'): FolderChangeLine => ({
  kind: 'new-folder',
  key,
  name,
  parent,
})
const move = (fileId: string, to: string): FolderChangeLine => ({ kind: 'move', fileId, to })
const rename = (fileId: string, name: string): FolderChangeLine => ({
  kind: 'rename',
  fileId,
  name,
})

describe('spec 024 — a batch of changes', () => {
  it('accepts lines of each kind', () => {
    expect(validateFolderChanges([folder('a'), move('f1', 'a'), rename('f2', 'B')]).ok).toBe(true)
  })

  it.each([
    ['no line', []],
    ['too many lines', Array.from({ length: 201 }, (_, i) => rename(`f${i}`, 'x'))],
    ['an empty name', [rename('f', '  ')]],
    ['a slash in a name', [rename('f', 'a/b')]],
    ['two folders with one key', [folder('a'), folder('a', 'root', 'Other')]],
    ['a key used before it exists', [move('f1', 'a'), folder('a')]],
    ['a file moved into itself', [move('f1', 'f1')]],
    ['a key standing for a file', [folder('a'), rename('a', 'B')]],
  ])('refuses %s', (_case, lines) => {
    expect(validateFolderChanges(lines)).toEqual({ ok: false, error: 'INVALID_CHANGES' })
  })

  it('refuses two new folders with one name in one place', () => {
    expect(validateFolderChanges([folder('a'), folder('b')])).toEqual({
      ok: false,
      error: 'NAME_CLASH',
    })
  })

  it('finds two files ending with one name in one place', () => {
    const items = new Map([
      ['f1', { name: 'One', parent: 'p1' }],
      ['f2', { name: 'Two', parent: 'p2' }],
    ])
    expect(clashes([rename('f1', 'Same'), rename('f2', 'Same')], items)).toBe(false)
    expect(clashes([rename('f1', 'Two'), move('f1', 'p2'), move('f2', 'p2')], items)).toBe(true)
    expect(clashes([folder('a', 'p1', 'One'), move('f2', 'p1')], items)).toBe(false)
    expect(clashes([folder('a', 'p1', 'Same'), rename('f1', 'Same')], items)).toBe(true)
  })

  it('leaves out what needs a folder left out, in chain', () => {
    const lines = [folder('a'), folder('b', 'a', 'Sub'), move('f1', 'b'), move('f2', 'root')]
    expect([...withDependents(lines, new Set([0]))].sort()).toEqual([0, 1, 2])
    expect([...withDependents(lines, new Set([3]))]).toEqual([3])
    expect(dependsOn(lines, 2)).toBe(1)
    expect(dependsOn(lines, 3)).toBeNull()
  })
})
