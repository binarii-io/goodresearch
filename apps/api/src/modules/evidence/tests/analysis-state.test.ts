import { describe, expect, it } from 'vitest'
import {
  type FactsRun,
  factsRef,
  interruptedFactsRun,
  isFactsRunLive,
  translationRef,
} from '../domain/analysis-run.ts'
import { analysisState } from '../domain/analysis-state.ts'

const T0 = new Date('2026-10-28T10:00:00Z')
const T1 = new Date('2026-10-28T11:00:00Z')

const reading = {
  rawImportedAt: T0,
  textAnalysed: 'with-corrections' as const,
  anonymised: false,
}
const base = {
  hasTranscript: true,
  text: { rawImportedAt: T0 },
  reading,
  textAnalysed: 'with-corrections' as const,
  anonymised: false,
  lost: 0,
  toDecide: 0,
}

describe('analysisState (FR-001, FR-011, research R3)', () => {
  it('follows the transcript, the setting and the reading', () => {
    expect(analysisState({ ...base, hasTranscript: false, text: null })).toBe('no-transcript')
    expect(analysisState({ ...base, text: null })).toBe('not-clean')
    expect(analysisState({ ...base, reading: null })).toBe('not-analysed')
    expect(analysisState({ ...base, toDecide: 2 })).toBe('to-decide')
    expect(analysisState(base)).toBe('done')
  })

  it('asks to analyse again for a lost verbatim, a re-imported transcript or a changed setting only', () => {
    expect(analysisState({ ...base, lost: 1, toDecide: 2 })).toBe('to-analyse-again')
    expect(analysisState({ ...base, text: { rawImportedAt: T1 } })).toBe('to-analyse-again')
    expect(analysisState({ ...base, anonymised: true })).toBe('to-analyse-again')
    expect(analysisState({ ...base, textAnalysed: 'clean-only' })).toBe('to-analyse-again')
  })
})

describe('FactsRun (FR-012, FR-013)', () => {
  const run: FactsRun = {
    id: 'r1',
    studyId: 'st',
    teamId: 'team',
    startedBy: 'a1',
    sessions: [
      { sessionId: 's1', state: 'done', chunks: 2, chunksDone: 2 },
      { sessionId: 's2', state: 'verbatims', chunks: 2, chunksDone: 1 },
      { sessionId: 's3', state: 'waiting', chunks: 0, chunksDone: 0 },
    ],
    stopRequested: false,
    stoppedSessions: [],
    leftOut: { verbatims: 0, facts: 0 },
    failure: null,
    startedAt: T0,
    heartbeatAt: T0,
    finishedAt: null,
  }

  it('is live while unfinished with a recent heartbeat; interrupted, its open interviews fail', () => {
    expect(isFactsRunLive(run, new Date(T0.getTime() + 5 * 60_000))).toBe(true)
    expect(isFactsRunLive(run, new Date(T0.getTime() + 11 * 60_000))).toBe(false)
    expect(isFactsRunLive(null, T0)).toBe(false)
    const stopped = interruptedFactsRun(run, T1)
    expect(stopped.finishedAt).toEqual(T1)
    expect(stopped.sessions.map((s) => [s.state, s.failure ?? null])).toEqual([
      ['done', null],
      ['failed', 'INTERRUPTED'],
      ['failed', 'INTERRUPTED'],
    ])
  })

  it('records costs per run and interview, translations per interview', () => {
    expect(factsRef('r1', 's1')).toBe('facts:r1:s1')
    expect(translationRef('s1')).toBe('facts-translation:s1')
  })
})
