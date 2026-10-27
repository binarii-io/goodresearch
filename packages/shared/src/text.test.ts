import { describe, expect, it } from 'vitest'
import {
  findMatches,
  fold,
  fromPlaceholders,
  isAcronym,
  nameKey,
  quoteFound,
  withPlaceholders,
  words,
} from './text.ts'

describe('fold', () => {
  it('drops case and accents', () => {
    expect(fold('Élodie Ça')).toBe('elodie ca')
  })
})

describe('words', () => {
  it('keeps apostrophes and hyphens inside words', () => {
    expect(words("l'équipe co-design, 2 NPS!").map((w) => w.text)).toEqual([
      "l'équipe",
      'co-design',
      '2',
      'NPS',
    ])
  })
  it('gives the offsets', () => {
    expect(words('a Bc').map((w) => [w.start, w.end])).toEqual([
      [0, 1],
      [2, 4],
    ])
  })
})

describe('isAcronym', () => {
  it('is 2 to 6 capitals, digits allowed', () => {
    expect(isAcronym('NPS')).toBe(true)
    expect(isAcronym('B2B')).toBe(true)
    expect(isAcronym('Nps')).toBe(false)
    expect(isAcronym('A')).toBe(false)
    expect(isAcronym('ABCDEFG')).toBe(false)
  })
})

describe('findMatches (lexicon match rule)', () => {
  it('matches whole words only', () => {
    expect(findMatches('Goodresearch and Goodresearchers', 'Goodresearch')).toEqual([0])
  })
  it('ignores case and accents for words', () => {
    expect(findMatches('the CAFÉ and the cafe', 'café')).toEqual([4, 17])
  })
  it('matches phrases across spaces and line breaks', () => {
    expect(findMatches('good\nresearch is good research', 'Good Research')).toEqual([0, 17])
  })
  it('keeps acronyms case-sensitive', () => {
    expect(findMatches('NPS, nps and Nps', 'NPS')).toEqual([0])
  })
  it('finds nothing for an empty spelling', () => {
    expect(findMatches('anything', '  ')).toEqual([])
  })
})

describe('quotes', () => {
  it('ignores case, spaces and apostrophe style', () => {
    expect(quoteFound('We use  the l’outil daily.', "we use the l'outil")).toBe(true)
    expect(quoteFound('We use it.', 'we never')).toBe(false)
    expect(quoteFound('x', '')).toBe(false)
  })
})

describe('placeholders', () => {
  it('replaces known names, full name first, then their words', () => {
    const { text, names } = withPlaceholders('Sam Example said Sam liked it', ['Sam Example'])
    expect(text).toBe('[Person 1] said [Person 1] liked it')
    expect(fromPlaceholders('[Person 1] said', names)).toBe('Sam Example said')
  })
  it('tells where each placeholder went', () => {
    const { cuts } = withPlaceholders('Hi Sam, bye', ['Sam Example'])
    expect(cuts).toEqual([{ start: 3, end: 6, placeholder: '[Person 1]' }])
  })
})

describe('nameKey', () => {
  it('is the same person whatever case, accents or spaces', () => {
    expect(nameKey(' Élodie  Martin ')).toBe(nameKey('elodie martin'))
  })
})
