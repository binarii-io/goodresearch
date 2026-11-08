import { describe, expect, it } from 'vitest'
import { usabilityNextStep } from '../domain/next-step.ts'
import { PROTOCOL_CHECKLIST, protocolCompleteness } from '../domain/protocol-progress.ts'

describe('spec 036 - test protocol design progress', () => {
  it('weighs nine points up to 100', () => {
    expect(PROTOCOL_CHECKLIST).toHaveLength(9)
    expect(PROTOCOL_CHECKLIST.reduce((n, [, w]) => n + w, 0)).toBe(100)
    expect(Object.fromEntries(PROTOCOL_CHECKLIST)).toEqual({
      objectiveHypotheses: 15,
      interface: 10,
      participants: 10,
      formatConsent: 10,
      scenario: 10,
      tasks: 25,
      criteria: 10,
      questionnaireDebrief: 5,
      biasReview: 5,
    })
  })

  it('counts done in full, partial by half, and an unknown state as missing', () => {
    expect(protocolCompleteness({ objectiveHypotheses: 'done', tasks: 'partial' }).percent).toBe(28)
    expect(protocolCompleteness({ tasks: 'nonsense' }).percent).toBe(0)
  })
})

describe('spec 036 - the next step of a usability test study', () => {
  const all = { hasProtocol: true, hasFolder: true, published: ['protocol'], checksDone: true }
  it.each([
    [
      'no protocol',
      { ...all, hasProtocol: false, hasFolder: false, published: [] },
      'write-protocol',
    ],
    ['no folder', { ...all, hasFolder: false, published: [] }, 'add-folder'],
    ['not published', { ...all, published: [] }, 'publish-protocol'],
    ['checks left', { ...all, checksDone: false }, 'readiness'],
    ['ready', all, 'run-sessions'],
    // Spec 037: then the sessions found in the folder.
    ['no session yet', { ...all, sessions: { total: 0, open: 0, notReady: 0 } }, 'run-sessions'],
    [
      'sessions to decide',
      { ...all, checksDone: false, sessions: { total: 3, open: 1, notReady: 2 } },
      'decide-sessions',
    ],
    ['sessions not ready', { ...all, sessions: { total: 3, open: 0, notReady: 1 } }, 'make-ready'],
    ['all ready', { ...all, sessions: { total: 3, open: 0, notReady: 0 } }, 'next-phase'],
  ])('with %s', (_case, state, step) => {
    expect(usabilityNextStep(state)).toBe(step)
  })
})

describe('spec 038 - the next step once the sessions are ready', () => {
  const ready = {
    hasProtocol: true,
    hasFolder: true,
    published: ['protocol'],
    checksDone: true,
    sessions: { total: 3, open: 0, notReady: 0 },
  }
  it.each([
    ['to analyse', { toAnalyse: 2, toReview: 0, running: false }, 'analyse-sessions'],
    ['running', { toAnalyse: 2, toReview: 0, running: true }, 'analysis-running'],
    ['to review', { toAnalyse: 0, toReview: 4, running: false }, 'review-observations'],
    ['reviewed', { toAnalyse: 0, toReview: 0, running: false }, 'analysis-done'],
  ] as const)('with %s', (_case, analysis, step) => {
    expect(usabilityNextStep({ ...ready, analysis })).toBe(step)
  })
})
