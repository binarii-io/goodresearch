import { describe, expect, it } from 'vitest'
import {
  createSurveyFact,
  decideSurveyFact,
  type FigureSnapshot,
  figureChanged,
  figureStatement,
  keepFigure,
  type SurveyFact,
  themeStatement,
  updateFigure,
} from '../domain/survey-facts.ts'

const at = new Date('2026-11-03T10:00:00Z')
const snap = (over: Partial<FigureSnapshot> = {}): FigureSnapshot => ({
  itemId: 'i1',
  measure: 'option',
  option: 'Every week',
  value: 62.5,
  base: 42,
  smallBase: false,
  ruleVersion: 0,
  ...over,
})
const ctx = { itemText: 'How often do you plan?', crossItemText: null, points: null }
const fact = (over: Partial<SurveyFact> = {}): SurveyFact => {
  const made = createSurveyFact({
    id: 'f1',
    studyId: 'st',
    support: { kind: 'figure', itemId: 'i1', figure: snap() },
    statement: figureStatement(snap(), ctx),
    polarity: 'neutral',
    theme: { id: 's1', title: 'Planning' },
    by: 'alex',
    now: at,
  })
  return { ...made, ...over }
}

describe('statements written by the app (spec 029 FR-010, clarification 2026-11-03)', () => {
  it("states an option's share, the item and the base, in both languages", () => {
    expect(figureStatement(snap(), ctx)).toEqual({
      en: '62.5 % of the 42 respondents answered “Every week” to “How often do you plan?”.',
      fr: '62,5 % des 42 répondants ont répondu « Every week » à « How often do you plan? ».',
    })
  })

  it('states agreement, disagreement and a mean', () => {
    const scale = { ...ctx, itemText: 'Planning is easy', points: 7 }
    expect(
      figureStatement(snap({ measure: 'agree', option: undefined, value: 40 }), scale).en,
    ).toBe('40 % of the 42 respondents agree with “Planning is easy”.')
    expect(
      figureStatement(snap({ measure: 'disagree', option: undefined, value: 12 }), scale).fr,
    ).toBe('12 % des 42 répondants ne sont pas d’accord avec « Planning is easy ».')
    expect(
      figureStatement(snap({ measure: 'mean', option: undefined, value: 5.2 }), scale),
    ).toEqual({
      en: '“Planning is easy”: mean of 5.2 out of 7, over 42 respondents.',
      fr: '« Planning is easy » : moyenne de 5,2 sur 7, sur 42 répondants.',
    })
  })

  it('names the cross and flags a small base', () => {
    const crossed = snap({ cross: { itemId: 'p', option: 'Designer' }, base: 12, smallBase: true })
    expect(figureStatement(crossed, { ...ctx, crossItemText: 'Your job' }).en).toBe(
      'Among the respondents who answered “Designer” to “Your job”, 62.5 % of the 12 respondents answered “Every week” to “How often do you plan?” (small base).',
    )
  })

  it('stays within 200 characters, shortening long texts', () => {
    const long = {
      ...ctx,
      itemText: 'A very long question '.repeat(20),
      crossItemText: 'x'.repeat(150),
    }
    const crossed = snap({ cross: { itemId: 'p', option: 'y'.repeat(150) } })
    const s = figureStatement(crossed, long)
    expect(s.en.length).toBeLessThanOrEqual(200)
    expect(s.fr.length).toBeLessThanOrEqual(200)
    expect(s.en).toContain('…')
  })

  it("takes a theme's description, or its label when the description is too long", () => {
    const label = { en: 'Too many tools', fr: 'Trop d’outils' }
    expect(
      themeStatement({ label, description: { en: 'People juggle tools.', fr: 'On jongle.' } }),
    ).toEqual({ en: 'People juggle tools.', fr: 'On jongle.' })
    expect(themeStatement({ label, description: { en: 'x'.repeat(300), fr: 'Court.' } })).toEqual({
      en: 'Too many tools.',
      fr: 'Court.',
    })
  })
})

describe('survey facts follow the statuses of facts (FR-011)', () => {
  it('is proposed by a person, then accepted, edited or rejected with the version seen', () => {
    const made = fact()
    expect(made).toMatchObject({ status: 'proposed', origin: 'person', version: 1 })
    const accepted = decideSurveyFact(made, { decision: 'accept', version: 1 }, 'robin', at, [])
    expect(accepted.ok && accepted.value).toMatchObject({ status: 'accepted', version: 2 })
    expect(decideSurveyFact(made, { decision: 'accept', version: 3 }, 'robin', at, [])).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })

  it('translates an edit written in one language, and refuses a known name', () => {
    const edited = decideSurveyFact(
      fact(),
      { decision: 'edit', version: 1, statement: { fr: 'La plupart planifient chaque semaine.' } },
      'robin',
      at,
      ['Camille Martin'],
    )
    expect(edited.ok && edited.value).toMatchObject({
      status: 'edited',
      translation: 'translating',
      statement: { fr: 'La plupart planifient chaque semaine.' },
    })
    const named = decideSurveyFact(
      fact(),
      { decision: 'edit', version: 1, statement: { en: 'Camille plans weekly.' } },
      'robin',
      at,
      ['Camille Martin'],
    )
    expect(named).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })
})

describe('figure changed (FR-012)', () => {
  it('compares to one decimal, value and base', () => {
    expect(figureChanged(snap(), { value: 62.54, base: 42 })).toBeNull()
    expect(figureChanged(snap(), { value: 60, base: 42 })).toEqual({ value: 60, base: 42 })
    expect(figureChanged(snap(), { value: 62.5, base: 48 })).toEqual({ value: 62.5, base: 48 })
  })

  it('updates to today with a new statement, or keeps it', () => {
    const today = snap({ value: 55, base: 50 })
    const updated = updateFigure(fact(), today, ctx, 1, 'robin', at)
    expect(updated.ok && updated.value).toMatchObject({
      version: 2,
      support: { figure: { value: 55, base: 50 } },
      statement: {
        en: '55 % of the 50 respondents answered “Every week” to “How often do you plan?”.',
      },
    })
    const kept = keepFigure(fact(), { value: 55, base: 50 }, 1, at)
    expect(kept.ok && kept.value).toMatchObject({ version: 2, keptAt: at })
    const snapshot =
      kept.ok && kept.value.support.kind === 'figure' ? kept.value.support.figure : snap()
    expect(figureChanged(snapshot, { value: 55, base: 50 })).toBeNull()
    expect(figureChanged(snapshot, { value: 50, base: 60 })).toEqual({ value: 50, base: 60 })
    expect(updateFigure(fact(), today, ctx, 4, 'robin', at)).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
  })
})
