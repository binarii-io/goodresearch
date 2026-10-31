import { describe, expect, it } from 'vitest'
import { hasUnsplitTurns, keepIds, parseSegments, type Segment } from '../domain/segments.ts'

describe('parseSegments', () => {
  it('reads a label with its office and no colon, at the start or inside a line', () => {
    expect(
      parseSegments(
        [
          'Lee EXAMPLE -CAMPUS- 0:08',
          'How many are you? Sam DOE SMITH -OFFICE NORTH 2- We are ten.',
          "Sam DOE SMITH -OFFICE NORTH 2- That's it.Lee EXAMPLE -CAMPUS-  Thanks.",
        ].join('\n'),
      ),
    ).toEqual([
      { speaker: 'Lee EXAMPLE -CAMPUS-', start: 8, text: 'How many are you?' },
      { speaker: 'Sam DOE SMITH -OFFICE NORTH 2-', start: null, text: 'We are ten.' },
      { speaker: 'Sam DOE SMITH -OFFICE NORTH 2-', start: null, text: "That's it." },
      { speaker: 'Lee EXAMPLE -CAMPUS-', start: null, text: 'Thanks.' },
    ])
  })

  it('reads what follows such a label as its words, even with a colon', () => {
    expect(parseSegments('Sam DOE -OFFICE NORTH- Well: yes.')).toEqual([
      { speaker: 'Sam DOE -OFFICE NORTH-', start: null, text: 'Well: yes.' },
    ])
  })

  it('leaves a header listing people with their offices before the first turn', () => {
    const header = 'Attending Lee and Sam DOE -OFFICE NORTH- and more'
    expect(parseSegments(`${header}\nLee: Hello`)).toEqual([
      { speaker: null, start: null, text: header },
      { speaker: 'Lee', start: null, text: 'Hello' },
    ])
    expect(hasUnsplitTurns([{ speaker: null, start: null, text: header }])).toBe(false)
  })

  it('does not take the note ending a transcript for a speaker', () => {
    expect(
      parseSegments('Lee 0:03\nHello\nTranscription terminée après 00:42:50\nGenerated.'),
    ).toEqual([
      { speaker: 'Lee', start: 3, text: 'Hello' },
      { speaker: null, start: 2570, text: 'Generated.' },
    ])
  })

  it('leaves ordinary dashes in the text', () => {
    for (const text of [
      'Lee: The North Team -as we call it- agreed.',
      'Lee: The Data Team -- SALES -- agreed.',
      'Lee: Sales -NORTH- agreed.',
    ])
      expect(parseSegments(text)).toHaveLength(1)
  })

  it('imports again a turn holding such a label inside a line', () => {
    expect(
      hasUnsplitTurns([{ speaker: 'Lee', start: null, text: 'Well? Sam DOE -OFFICE NORTH- Yes.' }]),
    ).toBe(true)
  })

  it('reads "Name: text" turns and joins continuation lines', () => {
    expect(parseSegments('Lee Example: Hello\nand welcome.\n\nSam Example: Hi')).toEqual([
      { speaker: 'Lee Example', start: null, text: 'Hello\nand welcome.' },
      { speaker: 'Sam Example', start: null, text: 'Hi' },
    ])
  })

  it('keeps a leading time and voice tags', () => {
    expect(parseSegments('[00:01:05] Lee: Hello\n<v Sam>Hi there')).toEqual([
      { speaker: 'Lee', start: 65, text: 'Hello' },
      { speaker: 'Sam', start: null, text: 'Hi there' },
    ])
  })

  it('reads "Name 0:03" on its own line, the words below', () => {
    expect(parseSegments('Lee Example   0:03\nHello there\nSam (00:01:15)\nHi')).toEqual([
      { speaker: 'Lee Example', start: 3, text: 'Hello there' },
      { speaker: 'Sam', start: 75, text: 'Hi' },
    ])
  })

  it('gives text before the first label a null speaker', () => {
    expect(parseSegments('Meeting notes\nLee: Hello')).toEqual([
      { speaker: null, start: null, text: 'Meeting notes' },
      { speaker: 'Lee', start: null, text: 'Hello' },
    ])
  })

  it('does not take a sentence with a colon for a label', () => {
    expect(parseSegments('Lee: We tried this: it failed.')).toEqual([
      { speaker: 'Lee', start: null, text: 'We tried this: it failed.' },
    ])
    expect(parseSegments('Next steps, then more: fine')[0]?.speaker).toBeNull()
  })

  it('reads a name followed by the office a meeting tool adds', () => {
    expect(
      parseSegments(
        "Lee EXAMPLE -OFFICE NORTH-: Ok.\nSam EXAMPLE -OFFICE SOUTH SITE D'ARC V2-: Hi there",
      ),
    ).toEqual([
      { speaker: 'Lee EXAMPLE -OFFICE NORTH-', start: null, text: 'Ok.' },
      { speaker: "Sam EXAMPLE -OFFICE SOUTH SITE D'ARC V2-", start: null, text: 'Hi there' },
    ])
  })

  it('finds turns read by an older rule, with a label inside', () => {
    const old = [
      {
        speaker: 'Lee EXAMPLE -OFFICE NORTH-',
        start: null,
        text: "Ok.\nSam EXAMPLE -OFFICE SOUTH SITE D'ARC V2-: Hi there",
      },
    ]
    expect(hasUnsplitTurns(old)).toBe(true)
    expect(hasUnsplitTurns(parseSegments(`Lee EXAMPLE -OFFICE NORTH-: ${old[0]?.text}`))).toBe(
      false,
    )
    expect(
      hasUnsplitTurns([{ speaker: 'Lee', start: null, text: 'We tried this:\nit failed.' }]),
    ).toBe(false)
  })
})

describe('keepIds', () => {
  let n = 0
  const newId = () => `new-${++n}`
  const previous: Segment[] = [
    { id: 'a', speaker: 'Lee', start: null, text: 'Hello' },
    { id: 'b', speaker: 'Sam', start: null, text: 'Hi' },
    { id: 'c', speaker: 'Lee', start: null, text: 'Bye' },
  ]

  it('keeps the ids of unchanged turns and gives new ones to the others', () => {
    n = 0
    const next = keepIds(
      previous,
      [
        { speaker: 'Lee', start: null, text: 'Hello' },
        { speaker: 'Sam', start: null, text: 'Hi, how are you?' },
        { speaker: 'Lee', start: 4, text: 'Bye' },
      ],
      newId,
    )
    expect(next.map((s) => s.id)).toEqual(['a', 'new-1', 'c'])
    expect(next[2]?.start).toBe(4)
  })

  it('gives new ids to everything without a previous version', () => {
    n = 0
    expect(keepIds([], [{ speaker: null, start: null, text: 'x' }], newId)[0]?.id).toBe('new-1')
  })
})

describe('keepIds on large transcripts (review of PR #10)', () => {
  it('keeps the ids of unchanged turns around a change, in bounded memory', () => {
    let n = 0
    const turns = Array.from({ length: 5_000 }, (_, i) => ({
      id: `p${i}`,
      speaker: i % 2 ? 'Sam' : 'Lee',
      start: null,
      text: `turn ${i}`,
    }))
    const next = turns.map(({ id: _id, ...t }, i) => (i === 2_500 ? { ...t, text: 'changed' } : t))
    const kept = keepIds(turns, next, () => `new-${++n}`)
    expect(kept[0]?.id).toBe('p0')
    expect(kept[4_999]?.id).toBe('p4999')
    expect(kept[2_500]?.id).toBe('new-1')
  })
  it('matches turns in order by their text when the changed middle is very large', () => {
    let n = 0
    const turns = Array.from({ length: 2_200 }, (_, i) => ({
      id: `p${i}`,
      speaker: 'Lee',
      start: null,
      text: `turn ${i}`,
    }))
    const next = turns.map(({ id: _id, ...t }, i) =>
      i === 0 || i === 2_199 ? { ...t, text: `changed ${i}` } : t,
    )
    const kept = keepIds(turns, next, () => `new-${++n}`)
    expect(kept[1]?.id).toBe('p1')
    expect(kept[2_198]?.id).toBe('p2198')
    expect([kept[0]?.id, kept[2_199]?.id]).toEqual(['new-1', 'new-2'])
  })
})
