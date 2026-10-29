import { describe, expect, it } from 'vitest'
import {
  canStopFacts,
  type FactsRun,
  interruptedFactsRun,
  withFactsStops,
} from '../domain/analysis-run.ts'

const at = new Date('2026-10-29T10:00:00Z')
const run = (over: Partial<FactsRun> = {}): FactsRun => ({
  id: 'run',
  studyId: 'study',
  teamId: 'team',
  startedBy: 'p1',
  sessions: [
    { sessionId: 'a', state: 'done', chunks: 2, chunksDone: 2 },
    { sessionId: 'b', state: 'verbatims', chunks: 3, chunksDone: 1 },
    { sessionId: 'c', state: 'waiting', chunks: 0, chunksDone: 0 },
    { sessionId: 'd', state: 'facts', chunks: 2, chunksDone: 2 },
  ],
  stopRequested: false,
  stoppedSessions: [],
  leftOut: { verbatims: 0, facts: 0 },
  failure: null,
  startedAt: at,
  heartbeatAt: at,
  finishedAt: null,
  ...over,
})

describe('stopping one interview of a facts reading', () => {
  it('is possible while it waits or is read, never once it is finished', () => {
    expect(canStopFacts(run(), 'b')).toBe(true)
    expect(canStopFacts(run(), 'c')).toBe(true)
    expect(canStopFacts(run(), 'd')).toBe(true)
    expect(canStopFacts(run(), 'a')).toBe(false)
    expect(canStopFacts(run(), 'unknown')).toBe(false)
    expect(canStopFacts(run({ finishedAt: at }), 'c')).toBe(false)
  })

  it('shows a stopped interview as stopped, whatever the reading last wrote', () => {
    expect(withFactsStops(run({ stoppedSessions: ['b', 'a'] })).sessions).toEqual([
      { sessionId: 'a', state: 'done', chunks: 2, chunksDone: 2 },
      { sessionId: 'b', state: 'failed', chunks: 3, chunksDone: 1, failure: 'STOPPED' },
      { sessionId: 'c', state: 'waiting', chunks: 0, chunksDone: 0 },
      { sessionId: 'd', state: 'facts', chunks: 2, chunksDone: 2 },
    ])
  })

  it('keeps an interview taken out as taken out when the whole run is interrupted', () => {
    const closed = interruptedFactsRun(run({ stoppedSessions: ['c'] }), at)
    expect(closed.sessions.map((s) => [s.sessionId, s.state, s.failure ?? null])).toEqual([
      ['a', 'done', null],
      ['b', 'failed', 'INTERRUPTED'],
      ['c', 'failed', 'STOPPED'],
      ['d', 'failed', 'INTERRUPTED'],
    ])
  })
})
