import { describe, expect, it } from 'vitest'
import type {
  QuestionnaireContent,
  QuestionnaireItem,
  QuestionnaireSection,
} from '../domain/questionnaire.ts'
import {
  checkItem,
  checkSections,
  estimateMinutes,
  randomisationOf,
} from '../domain/questionnaire-checks.ts'

const common = { id: 'i', measure: 'subjective', required: true, subTheme: null, contact: false }
const likert = (text: string, over: object = {}) =>
  ({
    ...common,
    text,
    kind: 'likert',
    points: 7,
    lowLabel: 'Low',
    highLabel: 'High',
    ...over,
  }) as QuestionnaireItem
const open = (text = 'Tell us more') => ({ ...common, text, kind: 'open' }) as QuestionnaireItem
const choice = (text = 'Pick') =>
  ({
    ...common,
    measure: 'factual',
    text,
    kind: 'single-choice',
    options: ['A', 'B'],
    ordered: false,
  }) as QuestionnaireItem

const section = (
  items: QuestionnaireItem[],
  kind: QuestionnaireSection['kind'] = 'theme',
): QuestionnaireSection => ({ id: kind, kind, title: 'T', items })

describe('checkItem', () => {
  it.each([
    ['double', 'The tool is fast and I like its colours'],
    ['double', "L'outil est rapide et j'aime ses couleurs"],
    ['double', 'Do you like it? Do you use it?'],
    ['negation', 'I do not find it useful'],
    ['negation', "Je ne trouve pas l'outil utile"],
    ['leading', 'Obviously the new screen is better'],
    ['leading', "L'écran est évidemment meilleur"],
    ['absolute', 'I always plan on Sundays'],
    ['absolute', 'Je planifie toujours le dimanche'],
    ['identifying', 'What is your first name?'],
    ['identifying', 'Quelle est votre adresse e-mail ?'],
  ])('flags %s in "%s"', (flag, text) => {
    expect(checkItem(likert(text))).toContain(flag)
  })

  it('flags an item over 30 words', () => {
    expect(checkItem(likert(Array.from({ length: 31 }, () => 'word').join(' ')))).toContain(
      'too-long',
    )
  })

  it('flags a factual measure on a Likert scale', () => {
    expect(checkItem(likert('It rained this year', { measure: 'factual' }))).toContain(
      'factual-on-likert',
    )
  })

  it('does not flag a plain item, nor an address on the contact item', () => {
    expect(checkItem(likert('Planning is easy for me'))).toEqual([])
    expect(checkItem({ ...open('Your email address'), contact: true, required: false })).toEqual([])
  })
})

describe('checkSections', () => {
  const profiling = section([choice()], 'profiling')

  it('flags no profiling item', () => {
    expect(checkSections([section([likert('A')])])).toContain('no-profiling')
    expect(checkSections([profiling, section([likert('A')])])).not.toContain('no-profiling')
  })

  it('flags scales with different legends', () => {
    expect(
      checkSections([profiling, section([likert('A'), likert('B', { points: 5 })])]),
    ).toContain('legends-differ')
    expect(checkSections([profiling, section([likert('A'), likert('B')])])).not.toContain(
      'legends-differ',
    )
  })

  it('flags more than 10 closed items in a row, across sections', () => {
    const scales = (n: number) => Array.from({ length: n }, (_, i) => likert(`S${i}`))
    expect(checkSections([section(scales(9), 'profiling'), section(scales(1))])).not.toContain(
      'closed-series',
    )
    expect(checkSections([section(scales(9), 'profiling'), section(scales(2))])).toContain(
      'closed-series',
    )
    expect(checkSections([section([...scales(6), open(), ...scales(6)])])).not.toContain(
      'closed-series',
    )
  })

  it('flags too many open items: at least 5, and more than a third', () => {
    const opens = (n: number) => Array.from({ length: n }, () => open())
    expect(checkSections([section([...opens(5), likert('A')])])).toContain('too-many-open')
    expect(checkSections([section([...opens(4), likert('A')])])).not.toContain('too-many-open')
    expect(
      checkSections([section([...opens(5), ...Array.from({ length: 10 }, () => likert('A'))])]),
    ).not.toContain('too-many-open')
  })
})

describe('estimateMinutes', () => {
  it('adds fixed times per kind and the consent, rounded up', () => {
    // 30 s consent + 8 s + 12 s + 45 s = 95 s.
    expect(estimateMinutes([section([likert('A'), choice(), open()])])).toBe(2)
  })
})

describe('randomisationOf', () => {
  const of = (items: QuestionnaireItem[], shuffle = true) =>
    randomisationOf({
      framing: { shuffle } as QuestionnaireContent['framing'],
      sections: [section(items)],
    })

  it('says scales are shuffled when two in a row share a legend, and the setting is on', () => {
    expect(of([likert('A'), likert('B')]).itemsShuffled).toBe(true)
    expect(of([likert('A'), likert('B')], false).itemsShuffled).toBe(false)
    expect(of([likert('A'), open(), likert('B')]).itemsShuffled).toBe(false)
    expect(of([likert('A'), likert('B', { points: 5 })]).itemsShuffled).toBe(false)
  })

  it('says options are shuffled unless ordered, and themes stay in order', () => {
    expect(of([choice()])).toMatchObject({ optionsShuffled: true, themesFixed: true })
    expect(of([{ ...choice(), ordered: true } as QuestionnaireItem]).optionsShuffled).toBe(false)
  })
})
