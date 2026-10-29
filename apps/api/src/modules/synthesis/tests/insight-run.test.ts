import { describe, expect, it } from 'vitest'
import {
  type InsightRun,
  insightsRef,
  insightTranslationRef,
  interruptedRun,
  isRunLive,
} from '../domain/insight-run.ts'

const start = new Date('2026-10-29T10:00:00Z')
const run: InsightRun = {
  id: 'r1',
  projectId: 'pr',
  teamId: 't',
  startedBy: 'p1',
  studyIds: ['st'],
  scope: 'all',
  withProposed: false,
  calls: 2,
  callsDone: 1,
  stopRequested: false,
  leftOut: 0,
  failure: null,
  startedAt: start,
  heartbeatAt: start,
  finishedAt: null,
}
const later = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

describe('InsightRun (FR-015, research R10)', () => {
  it('is live while unfinished and beating within 10 minutes', () => {
    expect(isRunLive(run, later(9))).toBe(true)
    expect(isRunLive(run, later(11))).toBe(false)
    expect(isRunLive({ ...run, finishedAt: later(1) }, later(2))).toBe(false)
    expect(isRunLive(null, later(1))).toBe(false)
  })

  it('ends a stale run as interrupted, keeping what it did', () => {
    expect(interruptedRun(run, later(20))).toMatchObject({
      callsDone: 1,
      failure: 'INTERRUPTED',
      finishedAt: later(20),
    })
  })

  it('names its ledger entries per call and the project translations', () => {
    expect(insightsRef('r1', 2)).toBe('insights:r1:2')
    expect(insightTranslationRef('pr')).toBe('insights-translation:pr')
  })
})
