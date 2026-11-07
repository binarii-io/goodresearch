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
  ])('with %s', (_case, state, step) => {
    expect(usabilityNextStep(state)).toBe(step)
  })
})
