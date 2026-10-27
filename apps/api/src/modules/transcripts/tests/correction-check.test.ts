import { describe, expect, it } from 'vitest'
import {
  type AnswerCorrection,
  checkCorrections,
  prepareChunk,
} from '../domain/correction-check.ts'
import { applyCorrections, type Correction } from '../domain/corrections.ts'
import type { Segment } from '../domain/segments.ts'

const raw: Segment[] = [
  { id: 'g0', speaker: 'Lee', start: null, text: 'Earlier words.' },
  {
    id: 'g1',
    speaker: 'Lee',
    start: null,
    text: 'Sam said the eating with Gooresearch was long, the eating again.',
  },
  { id: 'g2', speaker: 'Sam', start: null, text: 'We talked about the eating today.' },
]

const lexicon: Correction = {
  key: 'lex:t1:g1:25',
  sessionId: 's1',
  segmentId: 'g1',
  target: 'text',
  offset: 25,
  length: 11,
  original: 'Gooresearch',
  replacement: 'Goodresearch',
  edited: null,
  kind: 'term',
  source: 'lexicon',
  reason: null,
  confidence: null,
  termId: 't1',
  status: 'accepted',
  decidedBy: null,
  decidedAt: null,
  version: null,
}

let n = 0
const setup = (
  occurrences: {
    termId: string
    segmentId: string
    offset: number
    length: number
    spelling: string
    form: string
  }[] = [],
) => {
  const applied = applyCorrections(raw, [lexicon])
  const chunk = {
    turns: [
      {
        id: 't1',
        segmentId: 'g0',
        speaker: 'Lee',
        offset: 0,
        text: 'Earlier words.',
        context: true,
      },
      ...applied.segments.slice(1).map((s, i) => ({
        id: `t${i + 2}`,
        segmentId: s.id,
        speaker: s.speaker,
        offset: 0,
        text: s.text,
        context: false,
      })),
    ],
  }
  const sent = prepareChunk(chunk, ['Sam Example', 'Lee'], occurrences, applied.maps)
  return {
    sent,
    check: (
      corrections: Partial<AnswerCorrection>[],
      decisions: { occurrence: string; isTerm: boolean; reason: string | null }[] = [],
    ) =>
      checkCorrections(
        {
          sessionId: 's1',
          chunk: sent,
          raw: new Map(raw.map((s) => [s.id, s])),
          maps: applied.maps,
          speakers: ['Lee', 'Sam'],
          knownNames: ['Sam Example', 'Lee'],
          anonymised: false,
          neutral: '[Person]',
          newId: () => `c${++n}`,
        },
        {
          corrections: corrections.map((c) => ({
            turn: 't3',
            kind: 'transcription',
            original: 'eating',
            before: 'about the',
            replacement: 'meeting',
            reason: 'a meeting is talked about',
            confidence: 'high',
            ...c,
          })),
          decisions,
        },
      ),
  }
}

describe('prepareChunk', () => {
  it('replaces known names in the text and the speakers, and lists the open places of its new turns', () => {
    const { sent } = setup([
      { termId: 't2', segmentId: 'g2', offset: 20, length: 6, spelling: 'eating', form: 'meeting' },
    ])
    expect(sent.turns[1]?.sent).toBe(
      '[Person 1] said the eating with Goodresearch was long, the eating again.',
    )
    expect(sent.turns[2]?.speakerSent).toBe('[Person 1]')
    expect(sent.occurrences).toEqual([
      {
        id: 'o1',
        turn: 't3',
        termId: 't2',
        segmentId: 'g2',
        offset: 20,
        spelling: 'eating',
        form: 'meeting',
      },
    ])
  })
})

describe('checkCorrections (FR-006)', () => {
  it('keeps a correction found once, in raw offsets, proposed', () => {
    const { corrections, leftOut } = setup().check([{}])
    expect(leftOut).toBe(0)
    expect(corrections).toHaveLength(1)
    expect(corrections[0]).toMatchObject({
      segmentId: 'g2',
      offset: 20,
      length: 6,
      original: 'eating',
      replacement: 'meeting',
      source: 'ai-other',
      status: 'proposed',
      confidence: 'high',
    })
  })

  it('maps back past a lexicon correction and placeholders', () => {
    const { corrections } = setup().check([
      { turn: 't2', before: 'was long, the', original: 'eating' },
    ])
    expect(corrections[0]).toMatchObject({ segmentId: 'g1', offset: 51, original: 'eating' })
    expect(raw[1]?.text.slice(51, 57)).toBe('eating')
  })

  it('places a twice-written word with the words before it, and drops it when still ambiguous', () => {
    expect(setup().check([{ turn: 't2', before: 'said the' }]).corrections[0]?.offset).toBe(13)
    expect(setup().check([{ turn: 't2', before: null }]).leftOut).toBe(1)
  })

  it('drops what is not in the turn, in a context turn, too long, unchanged, or on a name', () => {
    const { leftOut, corrections } = setup().check([
      { original: 'banana' },
      { turn: 't1', original: 'words', before: 'Earlier', replacement: 'worlds' },
      {
        original: 'We talked about the eating today',
        before: null,
        replacement: 'One two three four five six seven eight nine ten',
      },
      { replacement: 'eating' },
      { turn: 't2', original: '[Person 1]', before: null, replacement: 'Sam' },
      { replacement: 'Sam Example' },
      { turn: 't2', original: 'Goodresearch', before: 'with', replacement: 'Good research' },
      { kind: 'name', replacement: '[Person]' },
    ])
    expect(corrections).toEqual([])
    expect(leftOut).toBe(8)
  })

  it('narrows a correction to the words that change', () => {
    const { corrections } = setup().check([
      {
        original: 'about the eating today',
        before: 'We talked',
        replacement: 'about the meeting today',
      },
    ])
    expect(corrections[0]).toMatchObject({ offset: 20, original: 'eating', replacement: 'meeting' })
  })

  it('keeps a speaker change to another speaker of the transcript', () => {
    const { corrections, leftOut } = setup().check([
      {
        turn: 't3',
        kind: 'speaker',
        original: '[Person 1]',
        before: null,
        replacement: '[Person 2]',
      },
      {
        turn: 't3',
        kind: 'speaker',
        original: '[Person 1]',
        before: null,
        replacement: 'Somebody',
      },
    ])
    expect(leftOut).toBe(1)
    expect(corrections[0]).toMatchObject({
      target: 'speaker',
      original: 'Sam',
      replacement: 'Lee',
      kind: 'speaker',
    })
  })

  it('keeps the decisions on the places sent only', () => {
    const { suggestions } = setup([
      { termId: 't2', segmentId: 'g2', offset: 20, length: 6, spelling: 'eating', form: 'meeting' },
    ]).check(
      [],
      [
        { occurrence: 'o1', isTerm: true, reason: 'a meeting' },
        { occurrence: 'o9', isTerm: true, reason: null },
      ],
    )
    expect(suggestions).toEqual([
      {
        termId: 't2',
        sessionId: 's1',
        segmentId: 'g2',
        offset: 20,
        isTerm: true,
        reason: 'a meeting',
      },
    ])
  })
})
