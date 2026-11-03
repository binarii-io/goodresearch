import { describe, expect, it } from 'vitest'
import { citedValue, columnOf, crossColumns, type FigureItem } from '../domain/figures.ts'

const choice: FigureItem = { kind: 'single-choice', options: ['Designer', 'Developer', 'PM'] }
const counts = (base: number, values: Record<string, number>) => ({
  base,
  values: new Map(Object.entries(values)),
})

describe('flat sort of a choice item (spec 029 FR-003, FR-005)', () => {
  it('gives each option in order, with its share of the respondents, then other answers', () => {
    const c = columnOf(choice, counts(40, { PM: 10, Designer: 25, 'Data analyst': 5 }))
    expect(c.options).toEqual([
      { value: 'Designer', count: 25, percent: 62.5 },
      { value: 'Developer', count: 0, percent: 0 },
      { value: 'PM', count: 10, percent: 25 },
    ])
    expect(c.other).toEqual({ count: 5, percent: 12.5 })
    expect(c).toMatchObject({ base: 40, smallBase: false })
  })

  it('counts a multiple-choice item over respondents, so shares may exceed 100 %', () => {
    const multiple: FigureItem = { kind: 'multiple-choice', options: ['A', 'B'] }
    const c = columnOf(multiple, counts(50, { A: 40, B: 30 }))
    expect(c.options?.map((o) => o.percent)).toEqual([80, 60])
  })

  it('flags a base under 30, and hides shares under 5', () => {
    expect(columnOf(choice, counts(29, { PM: 29 })).smallBase).toBe(true)
    expect(columnOf(choice, counts(30, { PM: 30 })).smallBase).toBe(false)
    const tiny = columnOf(choice, counts(4, { PM: 3, Designer: 1 }))
    expect(tiny.options?.map((o) => [o.count, o.percent])).toEqual([
      [1, null],
      [0, null],
      [3, null],
    ])
    expect(tiny.other).toEqual({ count: 0, percent: null })
  })

  it('rounds shares to one decimal', () => {
    const c = columnOf(choice, counts(3 * 10 + 1, { PM: 10 }))
    expect(c.options?.[2]?.percent).toBe(32.3)
  })

  it('has no share at all without respondents', () => {
    const c = columnOf(choice, counts(0, {}))
    expect(c).toMatchObject({ base: 0, smallBase: true })
    expect(c.options?.every((o) => o.percent === null)).toBe(true)
  })
})

describe('flat sort of a scale (spec 029 FR-004)', () => {
  const seven: FigureItem = { kind: 'likert', points: 7 }
  const five: FigureItem = { kind: 'likert', points: 5 }

  it('gives the count per point, mean, median and the shares of agreement and disagreement', () => {
    const c = columnOf(seven, counts(10, { '1': 1, '2': 1, '4': 2, '6': 3, '7': 3 }))
    expect(c.points?.map((p) => p.count)).toEqual([1, 1, 0, 2, 0, 3, 3])
    expect(c.points?.[5]?.percent).toBe(30)
    expect(c.mean).toBe(5)
    expect(c.median).toBe(6)
    expect(c.agree).toBe(60)
    expect(c.disagree).toBe(20)
  })

  it('takes the middle of the two central answers for an even base', () => {
    expect(columnOf(five, counts(4, { '2': 2, '3': 1, '5': 1 })).median).toBe(2.5)
    expect(columnOf(five, counts(5, { '2': 2, '3': 1, '5': 2 })).median).toBe(3)
  })

  it('uses the two highest and two lowest points of a 5-point scale', () => {
    const c = columnOf(five, counts(10, { '1': 1, '2': 2, '3': 3, '4': 2, '5': 2 }))
    expect(c.agree).toBe(40)
    expect(c.disagree).toBe(30)
  })

  it('counts a value that is not a point as other, outside the mean', () => {
    const c = columnOf(five, counts(6, { '5': 4, 'Strongly agree': 2 }))
    expect(c.other).toEqual({ count: 2, percent: 33.3 })
    expect(c.mean).toBe(5)
    expect(c.points?.[4]?.percent).toBe(66.7)
  })

  it('has no mean or median without a point answered', () => {
    const c = columnOf(five, counts(0, {}))
    expect(c.mean).toBeNull()
    expect(c.median).toBeNull()
    expect(c.agree).toBeNull()
  })
})

describe('cross by a profiling item (spec 029 FR-006)', () => {
  it('gives one column per profiling option, in its order, empty ones included', () => {
    const columns = crossColumns(
      choice,
      ['Small', 'Large', 'None'],
      new Map([
        ['Large', counts(40, { PM: 10 })],
        ['Small', counts(3, { Designer: 3 })],
      ]),
    )
    expect(columns.map((c) => [c.option, c.base, c.smallBase])).toEqual([
      ['Small', 3, true],
      ['Large', 40, false],
      ['None', 0, true],
    ])
    expect(columns[0]?.options?.[0]?.percent).toBeNull()
    expect(columns[1]?.options?.[2]?.percent).toBe(25)
  })
})

describe('the value a fact cites (spec 029 FR-010)', () => {
  const scale: FigureItem = { kind: 'likert', points: 5 }
  const column = columnOf(scale, counts(4, { '1': 1, '4': 1, '5': 2 }))
  it('reads an option, agreement, disagreement or mean, exact even when the share is hidden', () => {
    const job = columnOf(choice, counts(3, { PM: 1, Designer: 2 }))
    expect(citedValue(job, { measure: 'option', option: 'Designer' })).toEqual({
      value: 66.7,
      base: 3,
      smallBase: true,
    })
    expect(citedValue(column, { measure: 'agree' })?.value).toBe(75)
    expect(citedValue(column, { measure: 'disagree' })?.value).toBe(25)
    expect(citedValue(column, { measure: 'mean' })?.value).toBe(3.8)
  })
  it('finds nothing for an unknown option, an empty base, or a measure of another kind', () => {
    expect(
      citedValue(columnOf(choice, counts(10, {})), { measure: 'option', option: 'Nope' }),
    ).toBeNull()
    expect(
      citedValue(columnOf(choice, counts(0, {})), { measure: 'option', option: 'PM' }),
    ).toBeNull()
    expect(citedValue(columnOf(choice, counts(10, { PM: 2 })), { measure: 'mean' })).toBeNull()
  })
})
