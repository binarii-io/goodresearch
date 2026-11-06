import { describe, expect, it } from 'vitest'
import { keptOccurrences } from './kept-occurrences.ts'

const quote = (spelling: string, offset: number) => ({ match: spelling, offset, spelling })
const tally = (spelling: string, count: number, no = 0) => ({
  spelling,
  count,
  yes: 0,
  no,
  unsure: 0,
})

const interviews = [
  {
    sessionId: 'a',
    count: 4,
    yes: 0,
    no: 2,
    unsure: 0,
    quotes: [quote('AWS', 0), quote('Aws', 20), quote('AWS', 40), quote('Aws', 60)],
    spellings: [tally('AWS', 2), tally('Aws', 2, 2)],
  },
  {
    sessionId: 'b',
    count: 2,
    yes: 0,
    no: 0,
    unsure: 0,
    quotes: [quote('Amazon WS', 0)],
    spellings: [tally('Amazon WS', 2)],
  },
]

describe('the occurrences kept by the spellings switched on (spec 033)', () => {
  it('are all there when every spelling is kept', () => {
    expect(keptOccurrences(interviews, 'AWS', ['Aws', 'Amazon WS'])).toEqual(interviews)
  })

  it('lose the places, counts and verdicts of a spelling switched off, as written', () => {
    const kept = keptOccurrences(interviews, 'AWS', ['Amazon WS'])
    expect(kept.map((o) => [o.sessionId, o.count, o.no, o.quotes.map((q) => q.offset)])).toEqual([
      ['a', 2, 0, [0, 40]],
      ['b', 2, 0, [0]],
    ])
  })

  it('drop an interview left with none, and always keep the form', () => {
    const kept = keptOccurrences(interviews, 'AWS', [])
    expect(kept.map((o) => [o.sessionId, o.count])).toEqual([['a', 2]])
  })

  it('keep an interview whose counts per spelling are not known', () => {
    const unknown = [{ sessionId: 'c', count: 5, yes: 1, no: 0, unsure: 0, quotes: [] }]
    expect(keptOccurrences(unknown, 'AWS', [])).toEqual(unknown)
  })
})
