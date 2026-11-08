import { describe, expect, it } from 'vitest'
import { outOfDate } from '../domain/analysis.ts'
import { CHUNK_MS, chunksOf, ownedBy } from '../domain/chunks.ts'
import { estimateInputs, minutesOf } from '../domain/estimate.ts'
import {
  checksRejected,
  decideObservation,
  dedupe,
  givesFact,
  mergeAnalyses,
  type Observation,
  polarityOf,
} from '../domain/observation.ts'
import { studyResults } from '../domain/results.ts'
import { susMean, susScore } from '../domain/sus.ts'
import {
  correctTaskResult,
  outcomeWithHelp,
  type TaskResult,
  timeOnTask,
} from '../domain/task-result.ts'
import { segmentOfQuote } from '../domain/transcript.ts'
import { arbitrated, judged, needsArbiter } from '../domain/verdict.ts'

const NOW = new Date('2026-11-08T10:00:00Z')

const obs = (over: Partial<Observation> = {}): Observation => ({
  id: 'o1',
  analysisId: 'a1',
  taskId: 't1',
  kind: 'difficulty',
  momentMs: 60_000,
  text: 'Looks for the export in the wrong menu',
  quote: null,
  seen: 'Opens the Settings menu',
  susItem: null,
  susValue: null,
  screenshotKey: null,
  judge: 'kept',
  judgeReason: 'Seen at 1:00',
  arbiter: null,
  arbiterReason: null,
  origin: 'ai',
  status: 'proposed',
  decidedBy: null,
  decidedAt: null,
  version: 1,
  ...over,
})

const result = (over: Partial<TaskResult> = {}): TaskResult => ({
  id: 'r1',
  analysisId: 'a1',
  taskId: 't1',
  outcome: 'success',
  startMs: 0,
  endMs: 120_000,
  timeOnTaskMs: 120_000,
  path: 'Home, Reports, Export',
  ease: 6,
  status: 'accepted',
  decidedBy: 'u',
  decidedAt: NOW,
  version: 1,
  ...over,
})

describe('SUS (standard scoring)', () => {
  it('scores odd items answer − 1, even items 5 − answer, times 2.5', () => {
    const all = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, i % 2 === 0 ? 5 : 1]))
    expect(susScore(all)).toBe(100)
    const neutral = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, 3]))
    expect(susScore(neutral)).toBe(50)
  })

  it('gives no score with a missing or invalid answer, and a mean of known scores', () => {
    expect(susScore(new Map([[1, 5]]))).toBeNull()
    const bad = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, 6]))
    expect(susScore(bad)).toBeNull()
    expect(susMean([70, 80, null])).toEqual({ mean: 75, sessions: 2 })
    expect(susMean([null])).toEqual({ mean: null, sessions: 0 })
  })
})

describe('chunks of a long video', () => {
  it('reads 18-minute chunks overlapping by a minute, a moment belonging to one chunk', () => {
    const spans = chunksOf(40 * 60_000)
    expect(spans).toEqual([
      { startMs: 0, endMs: CHUNK_MS + 60_000 },
      { startMs: CHUNK_MS, endMs: 2 * CHUNK_MS + 60_000 },
      { startMs: 2 * CHUNK_MS, endMs: 40 * 60_000 },
    ])
    const inOverlap = CHUNK_MS + 20_000
    expect(ownedBy(inOverlap, 0, spans)).toBe(true)
    expect(ownedBy(inOverlap, 1, spans)).toBe(false)
    expect(ownedBy(CHUNK_MS + 40_000, 1, spans)).toBe(true)
  })
})

describe('quotes and verdicts', () => {
  const segments = [
    { speaker: 'P01', startMs: 0, endMs: 5000, text: "Hmm, where's the export?" },
    { speaker: 'P01', startMs: 5000, endMs: 9000, text: 'I would expect it here.' },
  ]

  it('finds a quote word for word, across two turns, never a paraphrase', () => {
    expect(segmentOfQuote(segments, 'where s the EXPORT')).toBe(segments[0])
    expect(segmentOfQuote(segments, 'export? I would expect')).toBe(segments[0])
    expect(segmentOfQuote(segments, 'I cannot find the export button')).toBeNull()
  })

  it('never rejects without contrary evidence; any doubt goes to the arbiter', () => {
    expect(judged({ verdict: 'rejected', reason: 'Not on the keyframes', contrary: null })).toEqual(
      {
        verdict: 'not-confirmed',
        reason: 'Not on the keyframes',
      },
    )
    expect(
      judged({ verdict: 'rejected', reason: 'The banner says saved', contrary: 'Saved' }).verdict,
    ).toBe('rejected')
    expect(needsArbiter('kept')).toBe(false)
    expect(needsArbiter('not-confirmed')).toBe(true)
    expect(arbitrated({ verdict: 'kept', reason: ' ' }).reason).toBe('Confirmed.')
    expect(checksRejected({ judge: 'rejected', arbiter: 'kept' })).toBe(false)
    expect(checksRejected({ judge: 'not-confirmed', arbiter: 'rejected' })).toBe(true)
  })
})

describe('observations', () => {
  it('drops a finding found twice in overlapping chunks', () => {
    expect(
      dedupe([obs(), obs({ id: 'o2', momentMs: 65_000 }), obs({ id: 'o3', momentMs: 90_000 })]),
    ).toHaveLength(2)
  })

  it('is decided by a person: accept, edit within limits, reject, reopen', () => {
    expect(decideObservation(obs(), { action: 'accept' }, 'u', NOW)).toMatchObject({
      ok: true,
      value: { status: 'accepted', decidedBy: 'u' },
    })
    expect(
      decideObservation(obs(), { action: 'edit', value: { text: 'x'.repeat(401) } }, 'u', NOW),
    ).toEqual({ ok: false, error: 'VALIDATION' })
    expect(decideObservation(obs(), { action: 'reopen' }, 'u', NOW)).toEqual({
      ok: false,
      error: 'INVALID_TRANSITION',
    })
    const edited = decideObservation(obs(), { action: 'edit', value: { kind: 'error' } }, 'u', NOW)
    expect(edited).toMatchObject({ ok: true, value: { kind: 'error', status: 'edited' } })
  })

  it('keeps decided ones on a new analysis and never proposes a rejected one again', () => {
    const previous = [
      obs({ id: 'kept', status: 'accepted' }),
      obs({ id: 'gone', status: 'rejected', text: 'Hesitates', momentMs: 200_000 }),
      obs({ id: 'open', text: 'Something else', momentMs: 300_000 }),
    ]
    const found = [
      obs({ id: 'n1', text: 'Hesitates', momentMs: 205_000 }),
      obs({ id: 'n2', text: 'New', momentMs: 400_000 }),
    ]
    const merged = mergeAnalyses(previous, found)
    expect(merged.keep.map((o) => o.id)).toEqual(['kept', 'gone'])
    expect(merged.add.map((o) => o.id)).toEqual(['n2'])
  })

  it('gives a fact only once decided, never for a questionnaire answer', () => {
    expect(givesFact(obs({ status: 'accepted' }))).toBe(true)
    expect(givesFact(obs())).toBe(false)
    expect(givesFact(obs({ kind: 'sus-answer', status: 'accepted' }))).toBe(false)
    expect(polarityOf('positive')).toBe('positive')
    expect(polarityOf('error')).toBe('negative')
  })
})

describe('task results and study results', () => {
  it('makes a helped success partial, and lets a person correct the outcome', () => {
    expect(outcomeWithHelp('success', true)).toBe('partial')
    expect(timeOnTask(1000, 500)).toBeNull()
    expect(correctTaskResult(result(), { outcome: 'failure' }, 'u', NOW)).toMatchObject({
      ok: true,
      value: { outcome: 'failure', status: 'edited' },
    })
  })

  it('counts outcomes, median time and difficulties by session; tasks matched by id', () => {
    const r = studyResults(
      ['t1', 't2'],
      [
        {
          sessionId: 's1',
          taskIds: ['t1', 't2'],
          tasks: [
            result(),
            result({ id: 'r2', taskId: 't2', outcome: 'failure', timeOnTaskMs: 60_000 }),
          ],
          observations: [obs({ status: 'accepted' })],
        },
        {
          sessionId: 's2',
          taskIds: ['t1'],
          tasks: [result({ id: 'r3', outcome: 'partial', timeOnTaskMs: 200_000 })],
          observations: [obs({ id: 'x', status: 'edited' }), obs({ id: 'y', text: 'Other' })],
        },
      ],
    )
    expect(r.tasks[0]).toMatchObject({
      sessions: 2,
      outcomes: { success: 1, partial: 1, failure: 0, 'not-attempted': 0 },
      medianMs: 160_000,
      difficulties: [{ text: 'Looks for the export in the wrong menu', sessions: 2 }],
    })
    // t2 was not in session 2's protocol version.
    expect(r.tasks[1]?.sessions).toBe(1)
    expect(r.toReview).toBe(1)
  })
})

describe('estimate and freshness', () => {
  it('asks per tier for a number of minutes', () => {
    expect(minutesOf(61_000)).toBe(2)
    expect(estimateInputs(10).map((e) => e.tier)).toEqual(['strong', 'standard'])
  })

  it('is out of date when the protocol version or the video changed', () => {
    const a = { protocolVersion: 2, videoFileId: 'v', videoModifiedAt: 'm', videoSize: 10 }
    const video = { fileId: 'v', modifiedAt: 'm', size: 10 }
    expect(outOfDate(a, { protocolVersion: 2, video })).toBe(false)
    expect(outOfDate(a, { protocolVersion: 3, video })).toBe(true)
    expect(outOfDate(a, { protocolVersion: 2, video: { ...video, modifiedAt: 'n' } })).toBe(true)
  })
})
