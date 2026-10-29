import { describe, expect, it } from 'vitest'
import {
  checkVerbatims,
  locate,
  mergeVerbatims,
  reanchor,
  type SentTurn,
  sendTurn,
} from '../domain/verbatims.ts'

const turn = (over: Partial<SentTurn> & { text: string }): SentTurn => ({
  ...sendTurn(
    {
      id: over.id ?? 't1',
      segmentId: over.segmentId ?? 'g1',
      speaker: over.speaker ?? 'Sam',
      offset: over.offset ?? 0,
      text: over.text,
      context: over.context ?? false,
    },
    ['Sam Example'],
  ),
})

const roles = (speaker: string | null) =>
  speaker === 'Alex' ? ('interviewer' as const) : ('interviewee' as const)

describe('locate', () => {
  it('finds a quote ignoring case, spaces and apostrophe style, and gives its place', () => {
    const text = 'Well,  I can’t find   the data of my team.'
    const found = locate(text, "i can't find the data")
    expect(found && text.slice(found.start, found.end)).toBe('I can’t find   the data')
    expect(locate(text, 'nowhere')).toBeNull()
  })
})

describe('checkVerbatims (FR-005)', () => {
  const text =
    'Honestly I never find the data of my team, it takes me three tools. The newsletter helps a lot.'

  it('keeps an exact excerpt of an interviewee turn, as the turn writes it', () => {
    const { kept, leftOut } = checkVerbatims(
      [turn({ text })],
      [{ turn: 't1', text: 'i never find the data of my team', reason: 'pain' }],
      roles,
    )
    expect(leftOut).toBe(0)
    expect(kept).toEqual([
      {
        segmentId: 'g1',
        offset: 9,
        length: 32,
        text: 'I never find the data of my team',
        speaker: 'Sam',
        reason: 'pain',
      },
    ])
  })

  it('drops a quote not in the turn, in a context turn, in an interviewer turn, or of the wrong length', () => {
    const { kept, leftOut } = checkVerbatims(
      [
        turn({ text }),
        turn({ id: 't2', segmentId: 'g2', text, context: true }),
        turn({ id: 't3', segmentId: 'g3', speaker: 'Alex', text }),
      ],
      [
        { turn: 't1', text: 'I always find the data', reason: null },
        { turn: 't2', text: 'The newsletter helps a lot', reason: null },
        { turn: 't3', text: 'The newsletter helps a lot', reason: null },
        { turn: 't1', text: 'newsletter helps', reason: null },
        { turn: 't9', text: 'The newsletter helps a lot', reason: null },
      ],
      roles,
    )
    expect(kept).toEqual([])
    expect(leftOut).toBe(5)
  })

  it('maps a quote holding a placeholder back to the name, and refuses half a placeholder', () => {
    const named = 'I asked Sam Example about it and he said no.'
    const t = turn({ text: named })
    expect(t.sent).toBe('I asked [Person 1] about it and he said no.')
    const { kept, leftOut } = checkVerbatims(
      [t],
      [
        { turn: 't1', text: 'I asked [Person 1] about it', reason: null },
        { turn: 't1', text: 'Person 1] about it and he said', reason: null },
      ],
      roles,
    )
    expect(kept.map((v) => v.text)).toEqual(['I asked Sam Example about it'])
    expect(leftOut).toBe(1)
  })

  it('keeps one of two overlapping excerpts of a turn, the longer, and a part offset counts', () => {
    const { kept } = checkVerbatims(
      [turn({ text, offset: 100 })],
      [
        { turn: 't1', text: 'I never find the data of my team', reason: null },
        {
          turn: 't1',
          text: 'never find the data of my team, it takes me three tools',
          reason: null,
        },
      ],
      roles,
    )
    expect(kept.map((v) => [v.offset, v.text])).toEqual([
      [111, 'never find the data of my team, it takes me three tools'],
    ])
  })
})

describe('mergeVerbatims (R7)', () => {
  const existing = [
    { id: 'v1', segmentId: 'g1', offset: 0, length: 20, setAside: false },
    { id: 'v2', segmentId: 'g2', offset: 0, length: 20, setAside: true },
  ]
  const found = (segmentId: string, offset: number, length: number) => ({
    segmentId,
    offset,
    length,
    text: 'x',
    speaker: 'Sam',
    reason: null,
  })

  it('reuses a verbatim found again, never brings back one set aside, adds the others', () => {
    const merged = mergeVerbatims(existing, [
      found('g1', 5, 10),
      found('g2', 10, 20),
      found('g3', 0, 20),
    ])
    expect(merged.reused).toEqual(['v1'])
    expect(merged.added.map((v) => v.segmentId)).toEqual(['g3'])
  })
})

describe('reanchor (R3)', () => {
  const turns = [
    { id: 'g1', speaker: 'Sam', text: 'We never find the data of our team.' },
    { id: 'g2', speaker: 'Sam', text: 'Again: I never find the data of my team!' },
  ]

  it('finds the text in its turn, then in the same speaker’s turns, else it is lost', () => {
    expect(
      reanchor(
        { segmentId: 'g2', offset: 0, text: 'I never find the data', speaker: 'Sam' },
        turns,
      ),
    ).toEqual({ segmentId: 'g2', offset: 7, length: 21 })
    expect(
      reanchor(
        { segmentId: 'g1', offset: 0, text: 'I never find the data', speaker: 'Sam' },
        turns,
      ),
    ).toEqual({ segmentId: 'g2', offset: 7, length: 21 })
    expect(
      reanchor({ segmentId: 'g1', offset: 0, text: 'something else', speaker: 'Sam' }, turns),
    ).toBeNull()
  })
})
