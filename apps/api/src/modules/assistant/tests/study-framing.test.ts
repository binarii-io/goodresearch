import { describe, expect, it } from 'vitest'
import {
  currentStudyFraming,
  openStudyPoints,
  studyFramingCompleteness,
} from '../domain/study-framing.ts'

const report = (states: Record<string, string>, at: number) => ({
  kind: 'report_study_progress',
  state: 'applied',
  decidedAt: new Date(at),
  preview: { progress: studyFramingCompleteness(states) },
})
const allDone = { reuse: 'done', goal: 'done', place: 'done' }

describe('spec 021 — study framing', () => {
  it('weighs the three points', () => {
    expect(studyFramingCompleteness(allDone).percent).toBe(100)
    expect(studyFramingCompleteness({ reuse: 'done' }).percent).toBe(20)
  })

  it('has every point open without a report', () => {
    expect(openStudyPoints(currentStudyFraming([]))).toEqual(['reuse', 'goal', 'place'])
  })

  it('reads the latest report and names what is left', () => {
    const framing = currentStudyFraming([
      report(allDone, 1),
      report({ reuse: 'done', goal: 'partial', place: 'done' }, 2),
    ])
    expect(openStudyPoints(framing)).toEqual(['goal'])
  })

  it('ends once a study is applied, and ignores a project applied or a project report', () => {
    const study = { kind: 'create_study', state: 'applied', decidedAt: new Date(2), preview: {} }
    const project = { ...study, kind: 'create_project' }
    expect(currentStudyFraming([report(allDone, 1), study])).toBeNull()
    expect(currentStudyFraming([report(allDone, 1), project])).not.toBeNull()
    expect(
      currentStudyFraming([{ ...report(allDone, 1), kind: 'report_project_progress' }]),
    ).toBeNull()
  })
})
