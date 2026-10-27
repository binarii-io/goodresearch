import { describe, expect, it } from 'vitest'
import { renderCleanDoc } from '../domain/clean-doc.ts'
import { cleaningState } from '../domain/cleaning-state.ts'
import {
  cleaningRef,
  interruptedCleaning,
  interviewRefs,
  isCleaningLive,
} from '../domain/correction-run.ts'

const T0 = new Date('2026-10-26T10:00:00Z')
const T1 = new Date('2026-10-26T11:00:00Z')
const T2 = new Date('2026-10-26T12:00:00Z')

const base = {
  importedAt: T0 as Date | null,
  cleaning: { cleanedAt: T1, anonymised: false } as { cleanedAt: Date; anonymised: boolean } | null,
  latest: { number: 1, rawImportedAt: T0, fingerprint: 'f1' } as {
    number: number
    rawImportedAt: Date
    fingerprint: string
  } | null,
  anonymised: false,
  toDecide: 0,
  fingerprint: 'f1',
  published: null as { versionNumber: number } | null,
}

describe('cleaningState (research R7)', () => {
  it('tells each state', () => {
    expect(cleaningState({ ...base, importedAt: null })).toBe('no-transcript')
    expect(cleaningState({ ...base, cleaning: null, latest: null })).toBe('not-cleaned')
    expect(cleaningState({ ...base, importedAt: T2 })).toBe('to-redo')
    expect(cleaningState({ ...base, anonymised: true })).toBe('to-redo')
    expect(cleaningState({ ...base, toDecide: 2 })).toBe('to-decide')
    expect(cleaningState({ ...base, latest: null })).toBe('to-decide')
    expect(cleaningState({ ...base, fingerprint: 'f2' })).toBe('lexicon-changed')
    expect(cleaningState(base)).toBe('clean')
    expect(cleaningState({ ...base, published: { versionNumber: 1 } })).toBe('published')
    expect(
      cleaningState({
        ...base,
        latest: { number: 2, rawImportedAt: T0, fingerprint: 'f1' },
        published: { versionNumber: 1 },
      }),
    ).toBe('out-of-date')
  })

  it('is clean again once validated after a change', () => {
    expect(
      cleaningState({
        ...base,
        importedAt: T1,
        cleaning: { cleanedAt: T2, anonymised: false },
        latest: { number: 2, rawImportedAt: T1, fingerprint: 'f1' },
      }),
    ).toBe('clean')
  })
})

describe('renderCleanDoc (FR-018)', () => {
  it('writes a title, then one paragraph per turn with its time when known', () => {
    const doc = renderCleanDoc('2026-10-01 – P01 – Interview', 'fr', [
      { id: 'g1', speaker: 'Intervieweur 1', start: 75, text: 'Bonjour.' },
      { id: 'g2', speaker: null, start: null, text: 'Notes.' },
      { id: 'g3', speaker: 'P01', start: 3_725, text: 'Oui.' },
    ])
    expect(doc.blocks).toEqual([
      { kind: 'heading', level: 1, text: '2026-10-01 – P01 – Interview – nettoyée' },
      { kind: 'paragraph', text: '[00:01:15] Intervieweur 1: Bonjour.' },
      { kind: 'paragraph', text: 'Notes.' },
      { kind: 'paragraph', text: '[01:02:05] P01: Oui.' },
    ])
  })
})

describe('correction run', () => {
  const run = {
    id: 'r1',
    studyId: 'st',
    teamId: 'team',
    startedBy: 'a1',
    mode: 'ai' as const,
    sessions: [
      { sessionId: 's1', state: 'done' as const, chunks: 2, chunksDone: 2 },
      { sessionId: 's2', state: 'cleaning' as const, chunks: 3, chunksDone: 1 },
    ],
    stopRequested: false,
    leftOut: 0,
    failure: null,
    startedAt: T0,
    heartbeatAt: T0,
    finishedAt: null,
  }

  it('has its ledger ref, goes stale, and interrupts what was left', () => {
    expect(cleaningRef('r1')).toBe('cleaning:r1')
    expect(cleaningRef('r1', 's1')).toBe('cleaning:r1:s1')
    // A first run that cleaned one interview: its run ref is that interview's too.
    expect(interviewRefs({ id: 'r1', sessions: run.sessions.slice(0, 1) }, 's1')).toEqual([
      'cleaning:r1:s1',
      'cleaning:r1',
    ])
    expect(interviewRefs(run, 's1')).toEqual(['cleaning:r1:s1'])
    expect(isCleaningLive(run, new Date(T0.getTime() + 60_000))).toBe(true)
    expect(isCleaningLive(run, new Date(T0.getTime() + 11 * 60_000))).toBe(false)
    const stopped = interruptedCleaning(run, T1)
    expect(stopped.finishedAt).toBe(T1)
    expect(stopped.sessions.map((s) => [s.state, s.failure])).toEqual([
      ['done', undefined],
      ['failed', 'INTERRUPTED'],
    ])
  })
})
