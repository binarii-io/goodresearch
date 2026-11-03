import { describe, expect, it } from 'vitest'
import {
  checkThemes,
  mergeThemes,
  PART_SIZE,
  type ProposedTheme,
  partsOf,
  type SentAnswer,
} from '../domain/themes.ts'

const bi = (en: string, fr = en) => ({ en, fr })
const sent = (n: number, text: string): SentAnswer => ({ number: n, sourceId: `r${n}`, text })
const theme = (label: string, answers: ProposedTheme['answers']): ProposedTheme => ({
  label: bi(label),
  description: bi(`About ${label}`),
  answers,
  existing: null,
})

describe('parts of a theme run (spec 029 research R6)', () => {
  it('numbers answers across the run and cuts them in parts of 150', () => {
    const parts = partsOf(
      Array.from({ length: 320 }, (_, i) => ({ sourceId: `r${i}`, text: `answer ${i}` })),
    )
    expect(parts.map((p) => p.length)).toEqual([PART_SIZE, PART_SIZE, 20])
    expect(parts[1]?.[0]).toEqual({ number: 151, sourceId: 'r150', text: 'answer 150' })
  })
})

describe('checking what the AI proposed (FR-008)', () => {
  const answers = [
    sent(1, 'Too many tools to plan anything'),
    sent(2, 'The tools never agree with each other'),
    sent(3, 'Meetings eat the week'),
  ]

  it('keeps answers it cites, quotes found word for word, drops the others', () => {
    const checked = checkThemes(
      [
        theme('Tools', [
          { n: 1, quote: 'too many tools' },
          { n: 2, quote: 'tools never agree with everyone' },
          { n: 9, quote: 'invented' },
        ]),
      ],
      answers,
      [],
    )
    expect(checked.themes).toEqual([
      {
        label: bi('Tools'),
        description: bi('About Tools'),
        existing: null,
        answers: [
          { sourceId: 'r1', quote: 'too many tools' },
          { sourceId: 'r2', quote: null },
        ],
      },
    ])
    expect(checked).toMatchObject({ droppedQuotes: 2, droppedThemes: 0 })
  })

  it('drops a theme with no answer, one rejected before, and puts an answer in one theme only', () => {
    const checked = checkThemes(
      [
        theme('Nothing', [{ n: 7, quote: null }]),
        theme('meetings', [{ n: 3, quote: null }]),
        theme('Tools', [{ n: 1, quote: null }]),
        theme('Planning', [
          { n: 1, quote: null },
          { n: 2, quote: null },
        ]),
      ],
      answers,
      ['Meetings'],
    )
    expect(checked.themes.map((t) => [t.label.en, t.answers.map((a) => a.sourceId)])).toEqual([
      ['Tools', ['r1']],
      ['Planning', ['r2']],
    ])
    expect(checked.droppedThemes).toBe(2)
  })
})

describe('merging the themes of several parts', () => {
  it('applies the merges the AI returned, ignoring unknown refs', () => {
    const one = {
      label: bi('Tools'),
      description: bi('a'),
      existing: null,
      answers: [{ sourceId: 'r1', quote: null }],
    }
    const two = { ...one, label: bi('Tooling'), answers: [{ sourceId: 'r200', quote: 'x' }] }
    const three = { ...one, label: bi('Meetings'), answers: [{ sourceId: 'r3', quote: null }] }
    const merged = mergeThemes(
      [one, two, three],
      [
        { keep: 't1', merge: ['t2', 't9'] },
        { keep: 't7', merge: ['t3'] },
      ],
    )
    expect(merged.map((t) => [t.label.en, t.answers.map((a) => a.sourceId)])).toEqual([
      ['Tools', ['r1', 'r200']],
      ['Meetings', ['r3']],
    ])
  })
})
