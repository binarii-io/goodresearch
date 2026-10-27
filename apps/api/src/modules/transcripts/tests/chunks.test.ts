import { describe, expect, it } from 'vitest'
import { makeChunks } from '../domain/chunks.ts'
import type { Segment } from '../domain/segments.ts'

const turns = (n: number, text = (i: number) => `turn ${i}.`): Segment[] =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, speaker: 'Lee', start: null, text: text(i) }))

const newOf = (c: ReturnType<typeof makeChunks>[number]) =>
  c.turns.filter((t) => !t.context).map((t) => t.segmentId)
const contextOf = (c: ReturnType<typeof makeChunks>[number]) =>
  c.turns.filter((t) => t.context).map((t) => t.segmentId)

describe('makeChunks (research R4)', () => {
  it('reads every turn once, 60 at a time, with the 5 turns before as context', () => {
    const chunks = makeChunks(turns(130))
    expect(chunks.map((c) => newOf(c).length)).toEqual([60, 60, 10])
    expect(contextOf(chunks[0] ?? { turns: [] })).toEqual([])
    expect(contextOf(chunks[1] ?? { turns: [] })).toEqual(['g55', 'g56', 'g57', 'g58', 'g59'])
    expect(chunks[1]?.turns.map((t) => t.id).slice(0, 6)).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
      't6',
    ])
    expect(new Set(chunks.flatMap(newOf)).size).toBe(130)
  })

  it('stays under the size limit', () => {
    const chunks = makeChunks(
      turns(60, () => 'x'.repeat(999)),
      { maxChars: 24_000 },
    )
    expect(chunks.length).toBeGreaterThan(2)
    for (const c of chunks)
      expect(c.turns.reduce((n, t) => n + t.text.length, 0)).toBeLessThanOrEqual(24_000)
  })

  it('cuts a very long turn at sentence ends, keeping where each part starts', () => {
    const sentence = `${'word '.repeat(19)}end. `
    const long: Segment = {
      id: 'g0',
      speaker: 'Lee',
      start: null,
      text: sentence.repeat(150).trim(),
    }
    const chunks = makeChunks([long])
    const parts = chunks.flatMap((c) => c.turns)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) {
      expect(p.text.length).toBeLessThanOrEqual(6_000)
      expect(long.text.slice(p.offset, p.offset + p.text.length)).toBe(p.text)
    }
    expect(parts[1]?.text.startsWith('word')).toBe(true)
  })

  it('reads only the turns asked, with their neighbours before as context', () => {
    const chunks = makeChunks(turns(200), { only: new Set(['g100', 'g102']) })
    expect(chunks.map(newOf)).toEqual([['g100', 'g102']])
    expect(contextOf(chunks[0] ?? { turns: [] })).toEqual([
      'g95',
      'g96',
      'g97',
      'g98',
      'g99',
      'g101',
    ])
  })
})
