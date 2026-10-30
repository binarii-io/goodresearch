import { describe, expect, it } from 'vitest'
import { canStopReading, interrupted, type LexiconRun, withStops } from '../domain/lexicon-run.ts'

const at = new Date('2026-10-29T10:00:00Z')
const run = (over: Partial<LexiconRun> = {}): LexiconRun => ({
  id: 'run',
  studyId: 'study',
  teamId: 'team',
  startedBy: 'p1',
  sessions: [
    { sessionId: 'a', state: 'done' },
    { sessionId: 'b', state: 'reading' },
    { sessionId: 'c', state: 'waiting' },
  ],
  phase: 'import',
  stopRequested: false,
  stoppedSessions: [],
  leftOut: 0,
  batchesTotal: 0,
  batchesDone: 0,
  failure: null,
  startedAt: at,
  heartbeatAt: at,
  finishedAt: null,
  ...over,
})

describe('stopping one interview of a reading', () => {
  it('is possible while it waits or is imported, never once the terms are being found', () => {
    expect(canStopReading(run(), 'c')).toBe(true)
    expect(canStopReading(run(), 'b')).toBe(true)
    expect(canStopReading(run(), 'a')).toBe(false)
    expect(canStopReading(run(), 'unknown')).toBe(false)
    expect(canStopReading(run({ phase: 'ai' }), 'c')).toBe(false)
    expect(canStopReading(run({ finishedAt: at }), 'c')).toBe(false)
  })

  it('shows a stopped interview as stopped, whatever the reading last wrote', () => {
    expect(withStops(run({ stoppedSessions: ['b', 'a'] })).sessions).toEqual([
      { sessionId: 'a', state: 'done' },
      { sessionId: 'b', state: 'failed', failure: 'STOPPED' },
      { sessionId: 'c', state: 'waiting' },
    ])
  })

  it('keeps an interview taken out as taken out when the whole reading is interrupted', () => {
    expect(interrupted(run({ stoppedSessions: ['c'] }), at).sessions).toEqual([
      { sessionId: 'a', state: 'done' },
      { sessionId: 'b', state: 'failed', failure: 'INTERRUPTED' },
      { sessionId: 'c', state: 'failed', failure: 'STOPPED' },
    ])
  })
})
