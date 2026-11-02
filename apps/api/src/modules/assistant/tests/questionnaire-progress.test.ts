import { describe, expect, it } from 'vitest'
import { surveyNextStep } from '../domain/next-step.ts'
import {
  QUESTIONNAIRE_CHECKLIST,
  questionnaireCompleteness,
} from '../domain/questionnaire-progress.ts'

describe('spec 027 - questionnaire design progress', () => {
  it('weighs eight points up to 100', () => {
    expect(QUESTIONNAIRE_CHECKLIST).toHaveLength(8)
    expect(QUESTIONNAIRE_CHECKLIST.reduce((n, [, w]) => n + w, 0)).toBe(100)
  })

  it('counts done in full, partial by half, and an unknown state as missing', () => {
    expect(
      questionnaireCompleteness({ objectiveThemes: 'done', thematicItems: 'partial' }).percent,
    ).toBe(33)
    expect(questionnaireCompleteness({ objectiveThemes: 'nonsense' }).percent).toBe(0)
  })
})

describe('spec 027 - the next step of a survey study', () => {
  const all = {
    hasQuestionnaire: true,
    hasFolder: true,
    published: ['questionnaire'],
    checksDone: true,
  }
  it.each([
    [
      'no questionnaire',
      { ...all, hasQuestionnaire: false, hasFolder: false, published: [] },
      'write-questionnaire',
    ],
    ['no folder', { ...all, hasFolder: false, published: [] }, 'add-folder'],
    ['not published', { ...all, published: [] }, 'publish-questionnaire'],
    ['checks left', { ...all, checksDone: false }, 'readiness'],
    ['all done', all, 'fieldwork-later'],
  ])('with %s', (_case, state, step) => {
    expect(surveyNextStep(state)).toBe(step)
  })
})
