import { describe, expect, it } from 'vitest'
import {
  acceptedOf,
  type SurveySection,
  stateOf,
  toStored,
  validRule,
} from '../domain/responses.ts'

const common = { required: true, subTheme: null, contact: false, measure: 'factual' as const }
const sections: SurveySection[] = [
  {
    id: 's0',
    kind: 'profiling',
    items: [
      {
        ...common,
        id: 'job',
        text: 'Job',
        kind: 'single-choice',
        options: ['Designer', 'Developer'],
      },
      {
        ...common,
        id: 'tools',
        text: 'Tools',
        kind: 'multiple-choice',
        options: ['A', 'B', 'C'],
      },
      { ...common, id: 'free', text: 'Free', kind: 'open' },
    ],
  },
  {
    id: 's1',
    kind: 'theme',
    items: [
      { ...common, id: 'scale', text: 'Scale', kind: 'likert' },
      { ...common, id: 'grid', text: 'Row', kind: 'likert' },
      { ...common, id: 'why', text: 'Why', kind: 'open' },
      { ...common, id: 'mail', text: 'Address', kind: 'open', contact: true },
    ],
  },
]
const map = {
  consent: { formItemId: 'f', questionId: 'qc' },
  'item:job': { formItemId: 'a', questionId: 'qj' },
  'item:tools': { formItemId: 'b', questionId: 'qt' },
  'item:free': { formItemId: 'c', questionId: 'qf' },
  'item:scale': { formItemId: 'd', questionId: 'qs' },
  'item:grid': { formItemId: 'e', questionId: 'qg' },
  'item:why': { formItemId: 'g', questionId: 'qw' },
  'item:mail': { formItemId: 'h', questionId: 'qm' },
  'section:s1': { formItemId: 'i', questionId: null },
}
const read = (answers: Record<string, string[]>) =>
  toStored({ id: 'r', submittedAt: '2026-11-02T10:00:00Z', answers }, map, sections, 'Yes')

describe('toStored', () => {
  it('attaches each answer to its item, a scale or a grid column as its number', () => {
    const { response } = read({
      qc: ['Yes'],
      qj: ['Designer'],
      qt: ['A', 'B'],
      qs: ['6'],
      qg: ['7 – Agree'],
      qw: ['Because'],
    })
    expect(response.consent).toBe('given')
    expect(response.answers).toEqual({
      job: ['Designer'],
      tools: ['A', 'B'],
      scale: ['6'],
      grid: ['7'],
      why: ['Because'],
    })
  })

  it('never keeps the contact item, nor counts it as unknown', () => {
    const out = read({ qc: ['Yes'], qm: ['someone@example.test'] })
    expect(JSON.stringify(out.response)).not.toContain('someone')
    expect(out.unknownQuestions).toEqual([])
  })

  it('keeps nothing of a refusal, or of a consent answered by neither option', () => {
    expect(read({ qc: ['No'] }).response).toMatchObject({ consent: 'refused', answers: {} })
    expect(read({}).response.consent).toBe('refused')
  })

  it('keeps a response whose consent label changed since: it went on, so it agreed', () => {
    expect(read({ qc: ['An older label'], qj: ['Designer'] }).response).toMatchObject({
      consent: 'given',
      answers: { job: ['Designer'] },
    })
  })

  it('leaves out a question it does not know, and tells it', () => {
    const out = read({ qc: ['Yes'], other: ['Secret'] })
    expect(out.unknownQuestions).toEqual(['other'])
    expect(JSON.stringify(out.response)).not.toContain('Secret')
  })

  it('keeps an option not in the list as given, and counts it', () => {
    const out = read({ qc: ['Yes'], qj: ['Typed by hand'] })
    expect(out.response.answers.job).toEqual(['Typed by hand'])
    expect(out.unknownValues).toBe(1)
  })
})

describe('stateOf', () => {
  const given = (answers: Record<string, string[]>) => ({ consent: 'given' as const, answers })

  it('counts every response with consent without a rule', () => {
    expect(stateOf(given({}), {})).toBe('counted')
    expect(stateOf({ consent: 'refused', answers: {} }, {})).toBe('refused-consent')
  })

  it('filters a single choice', () => {
    const rule = { job: ['Designer'] }
    expect(stateOf(given({ job: ['Designer'] }), rule)).toBe('counted')
    expect(stateOf(given({ job: ['Developer'] }), rule)).toBe('out-of-target')
  })

  it('takes one accepted answer among several', () => {
    expect(stateOf(given({ tools: ['A', 'C'] }), { tools: ['C'] })).toBe('counted')
  })

  it('needs every filtered item to pass', () => {
    const rule = { job: ['Designer'], tools: ['C'] }
    expect(stateOf(given({ job: ['Designer'], tools: ['A'] }), rule)).toBe('out-of-target')
  })

  it('tells a filtered item not answered, before anything else', () => {
    const rule = { job: ['Designer'], tools: ['C'] }
    expect(stateOf(given({ tools: ['A'] }), rule)).toBe('profile-not-answered')
  })

  it('never lets an option written by hand pass', () => {
    expect(stateOf(given({ job: ['Typed'] }), { job: ['Designer'] })).toBe('out-of-target')
  })
})

describe('the target rule', () => {
  it('takes only choice items of a profiling section, and their options', () => {
    expect(validRule({ job: ['Designer'] }, sections)).toBe(true)
    expect(validRule({ tools: ['A', 'C'] }, sections)).toBe(true)
    expect(validRule({ free: ['x'] }, sections)).toBe(false)
    expect(validRule({ scale: ['1'] }, sections)).toBe(false)
    expect(validRule({ job: ['Unknown'] }, sections)).toBe(false)
    expect(validRule({ job: [] }, sections)).toBe(false)
    expect(validRule({ gone: ['x'] }, sections)).toBe(false)
  })

  it('ignores an item or an option no longer there, and reports it', () => {
    expect(acceptedOf({ job: ['Designer', 'Gone'], gone: ['x'] }, sections)).toEqual({
      accepted: { job: ['Designer'] },
      stale: true,
    })
    expect(acceptedOf({ job: ['Gone'] }, sections).accepted).toEqual({})
    expect(acceptedOf({ job: ['Designer'] }, sections).stale).toBe(false)
  })
})
