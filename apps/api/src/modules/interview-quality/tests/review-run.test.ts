import { describe, expect, it } from 'vitest'
import {
  interruptedReview,
  isReviewLive,
  type ReviewRun,
  RUN_STALE_MS,
  reviewRef,
  reviewRunState,
} from '../domain/review-run.ts'

const now = new Date('2026-10-31T10:00:00Z')
const run: ReviewRun = {
  id: 'r1',
  studyId: 'st',
  startedBy: 'a1',
  sessions: [
    { sessionId: 's1', state: 'done', chunks: 2, chunksDone: 2 },
    { sessionId: 's2', state: 'reading', chunks: 2, chunksDone: 1 },
  ],
  stopRequested: false,
  leftOut: 0,
  failure: null,
  startedAt: now,
  heartbeatAt: now,
  finishedAt: null,
}

describe('ReviewRun', () => {
  it('has a ledger ref per run and interview', () => {
    expect(reviewRef('r1', 's1')).toBe('quality:r1:s1')
  })
  it('is live until finished or without heartbeat for too long', () => {
    expect(isReviewLive(run, now)).toBe(true)
    expect(isReviewLive(run, new Date(now.getTime() + RUN_STALE_MS))).toBe(false)
    expect(isReviewLive({ ...run, finishedAt: now }, now)).toBe(false)
    expect(isReviewLive(null, now)).toBe(false)
  })
  it('tells running, stopping, finished and stopped', () => {
    expect(reviewRunState(run)).toBe('running')
    expect(reviewRunState({ ...run, stopRequested: true })).toBe('stopping')
    expect(reviewRunState({ ...run, finishedAt: now })).toBe('finished')
    expect(reviewRunState({ ...run, finishedAt: now, stopRequested: true })).toBe('stopped')
  })
  it('marks the interviews still open as interrupted when it dies', () => {
    const closed = interruptedReview(run, now)
    expect(closed.finishedAt).toEqual(now)
    expect(closed.sessions.map((s) => [s.state, s.failure])).toEqual([
      ['done', undefined],
      ['failed', 'INTERRUPTED'],
    ])
  })
})
