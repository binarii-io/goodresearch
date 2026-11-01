import { describe, expect, it } from 'vitest'
import { type JourneyCounts, nextStep, stepsOf } from '../domain/journey.ts'

const empty = { total: 0, validated: 0, toDecide: 0 }
const allDone = { total: 3, validated: 3, toDecide: 0 }
const counts = (over: Partial<JourneyCounts> = {}): JourneyCounts => ({
  interviews: { ...allDone, participants: 3 },
  facts: allDone,
  insights: allDone,
  recommendations: allDone,
  takeawaysWritten: true,
  ...over,
})

const stateOf = (over: Partial<JourneyCounts>, key: string) =>
  stepsOf(counts(over)).find((s) => s.key === key)?.state

describe('the journey of a project (spec 017)', () => {
  it('lists the five steps in order', () => {
    expect(stepsOf(counts()).map((s) => s.key)).toEqual([
      'interviews',
      'facts',
      'insights',
      'recommendations',
      'debrief',
    ])
  })

  it('has no next step when everything is done', () => {
    expect(nextStep(stepsOf(counts()))).toBeNull()
  })

  it('starts a new project on the interviews', () => {
    const steps = stepsOf({
      interviews: { ...empty, participants: 0 },
      facts: empty,
      insights: empty,
      recommendations: empty,
      takeawaysWritten: false,
    })
    expect(steps.map((s) => s.state)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
    expect(nextStep(steps)).toBe('interviews')
  })

  it('does not hold the research on interviews left to validate once one is validated', () => {
    const interviews = { total: 24, validated: 21, toDecide: 3, participants: 22 }
    expect(stateOf({ interviews }, 'interviews')).toBe('done')
    expect(nextStep(stepsOf(counts({ interviews })))).toBeNull()
  })

  it('asks to validate the interviews while none is validated', () => {
    const interviews = { total: 3, validated: 0, toDecide: 3, participants: 2 }
    expect(stateOf({ interviews }, 'interviews')).toBe('to-decide')
    expect(nextStep(stepsOf(counts({ interviews })))).toBe('interviews')
  })

  it('points to the first step with items to decide', () => {
    const facts = { total: 612, validated: 148, toDecide: 464 }
    const insights = { total: 9, validated: 0, toDecide: 9 }
    expect(nextStep(stepsOf(counts({ facts, insights })))).toBe('facts')
  })

  it('points to the first empty step, whatever comes after', () => {
    const steps = stepsOf(counts({ facts: empty }))
    expect(steps.find((s) => s.key === 'insights')?.state).toBe('done')
    expect(nextStep(steps)).toBe('facts')
  })

  it('ends on the debrief while the takeaways are not written', () => {
    const steps = stepsOf(counts({ takeawaysWritten: false }))
    expect(steps.at(-1)?.state).toBe('empty')
    expect(nextStep(steps)).toBe('debrief')
  })
})
