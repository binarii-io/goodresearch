import { describe, expect, it } from 'vitest'
import { buildDeck, type DeckInput, fingerprintOf, type Slide } from '../domain/deck.ts'
import { presentationOf } from '../domain/deck-pages.ts'

const bi = (en: string, fr = `${en} (fr)`) => ({ en, fr })
const insight = (id: string, over: Partial<DeckInput['insights'][number]> = {}) => ({
  id,
  status: 'validated' as const,
  theme: { key: 'finding data', title: 'Finding data' },
  statement: bi(`Insight ${id}`),
  description: bi('What we heard.'),
  level: 'high' as const,
  polarity: 'negative' as const,
  support: 5,
  counter: 1,
  panel: 8,
  facts: 7,
  counterEvidence: bi('None'),
  minorityView: bi('None'),
  verbatims: [],
  ...over,
})
const rec = (id: string, over: Partial<DeckInput['recommendations'][number]> = {}) => ({
  id,
  status: 'validated' as const,
  action: bi(`Do ${id}`),
  successMeasure: bi('Less time lost'),
  kind: 'build' as const,
  impact: 'high' as const,
  effort: 'low' as const,
  priority: 5,
  owner: 'Data team',
  evidence: 'high' as const,
  ...over,
})
const study = {
  name: 'Interviews',
  type: 'interviews',
  interviews: 6,
  first: '2026-10-01',
  last: '2026-10-20',
  themes: ['Finding data', 'Sharing'],
  questions: 12,
  participants: 6,
}
const input = (over: Partial<DeckInput> = {}): DeckInput => ({
  language: 'en',
  withProposed: false,
  names: ['Sam Example'],
  project: {
    name: 'Finding data',
    goal: 'How teams find their data',
    team: 'Research',
  },
  studies: [study],
  takeaways: { text: bi('Teams lose time. A catalogue helps.'), toValidate: 0 },
  insights: [insight('a')],
  recommendations: [rec('r1')],
  ...over,
})
const kinds = (d: Slide[]) => d.map((s) => s.kind)
const find = <K extends Slide['kind']>(d: Slide[], kind: K) =>
  d.filter((s): s is Extract<Slide, { kind: K }> => s.kind === kind)

describe('buildDeck (spec 015 FR-002, as the prototype)', () => {
  it('orders the slides and leaves out the empty sections, except title and thanks', () => {
    expect(kinds(buildDeck(input()))).toEqual([
      'title',
      'takeaways',
      'context',
      'method',
      'numbers',
      'insightsTable',
      'insight',
      'recommendations',
      'matrix',
      'nextSteps',
      'thanks',
    ])
    expect(
      kinds(
        buildDeck(
          input({
            takeaways: null,
            insights: [],
            recommendations: [],
            studies: [],
            project: { name: 'P', goal: '', team: null },
          }),
        ),
      ),
    ).toEqual(['title', 'thanks'])
  })

  it('opens with interviews, period, panel and team; the essential with the top 3 recommendations', () => {
    const deck = buildDeck(
      input({ recommendations: ['r1', 'r2', 'r3', 'r4'].map((id) => rec(id)) }),
    )
    expect(find(deck, 'title')[0]).toMatchObject({
      interviews: 6,
      first: '2026-10-01',
      last: '2026-10-20',
      participants: 6,
      team: 'Research',
    })
    expect(find(deck, 'takeaways')[0]?.recommendations.map((r) => r.action)).toEqual([
      'Do r1',
      'Do r2',
      'Do r3',
    ])
  })

  it('groups the insights at a glance by what works, what holds back, the other findings', () => {
    const deck = buildDeck(
      input({
        insights: [
          insight('neg'),
          insight('pos', { polarity: 'positive' }),
          insight('mix', { polarity: 'mixed', level: 'low' }),
        ],
      }),
    )
    expect(
      find(deck, 'insightsTable').map((s) => [s.group, s.rows.map((r) => r.statement)]),
    ).toEqual([
      ['works', ['Insight pos']],
      ['blocks', ['Insight neg']],
      ['findings', ['Insight mix']],
    ])
    // Numbered most solid first, the same number on its own slide.
    expect(find(deck, 'insight').map((s) => [s.number, s.statement])).toEqual([
      [1, 'Insight neg'],
      [2, 'Insight pos'],
      [3, 'Insight mix'],
    ])
  })

  it('shows only what is validated, unless asked; then marks it "to validate" (FR-003)', () => {
    const data = input({
      insights: [
        insight('a'),
        insight('b', { status: 'proposed' }),
        insight('c', { status: 'rejected' }),
      ],
      recommendations: [rec('r1'), rec('r2', { status: 'proposed' })],
    })
    expect(find(buildDeck(data), 'insight')).toHaveLength(1)
    const all = buildDeck({ ...data, withProposed: true })
    expect(find(all, 'insight').map((s) => s.toValidate)).toEqual([false, true])
    expect(find(all, 'recommendations')[0]?.rows.map((r) => r.toValidate)).toEqual([false, true])
    // Next steps: the validated ones only, when there are some.
    expect(find(all, 'nextSteps')[0]?.rows.map((r) => r.action)).toEqual(['Do r1'])
  })

  it('shows the AI draft of the takeaways, as such, only with what is still to decide (FR-003)', () => {
    const takeaways = { text: bi('Saved text.'), toValidate: 0, draft: bi('Draft text.') }
    const slide = (withProposed: boolean) =>
      find(buildDeck(input({ takeaways, withProposed })), 'takeaways')[0]
    expect(slide(false)).toMatchObject({ text: 'Saved text.', draft: false })
    expect(slide(true)).toMatchObject({ text: 'Draft text.', draft: true })
    // A draft already used is the text: nothing to flag.
    const used = { ...takeaways, draft: bi('Saved text.') }
    expect(
      find(buildDeck(input({ takeaways: used, withProposed: true })), 'takeaways')[0],
    ).toMatchObject({ text: 'Saved text.', draft: false })
  })

  it('counts in the panel the people of facts still to decide only when asked (FR-003)', () => {
    const studies = [{ ...study, toValidate: 2 }]
    const panel = (withProposed: boolean) =>
      find(buildDeck(input({ studies, withProposed })), 'numbers')[0]
    expect(panel(false)).toMatchObject({ participants: 6, toValidate: 0 })
    expect(panel(true)).toMatchObject({ participants: 8, toValidate: 2 })
  })

  it('picks the emblematic verbatim, names replaced, about 140 characters (FR-004)', () => {
    const long = `Sam Example told me ${'that the data is somewhere '.repeat(4)}but nobody knows where.`
    const deck = buildDeck(
      input({
        insights: [
          insight('a', {
            verbatims: [
              { participant: 'P01', text: 'Too short.' },
              { participant: 'P02', text: long },
              { participant: 'P03', text: 'x'.repeat(400) },
            ],
          }),
        ],
      }),
    )
    const quote = find(deck, 'insight')[0]?.quote
    expect(quote?.participant).toBe('P02')
    expect(quote?.text.startsWith('[…] told me')).toBe(true)
  })

  it('puts 6 rows per table slide, and all recommendations in the matrix', () => {
    const recs = Array.from({ length: 11 }, (_, n) => rec(`r${n}`))
    const deck = buildDeck(input({ recommendations: recs }))
    expect(find(deck, 'recommendations').map((s) => [s.page, s.pages, s.rows.length])).toEqual([
      [1, 2, 6],
      [2, 2, 5],
    ])
    expect(find(deck, 'matrix')[0]?.items).toHaveLength(11)
    expect(find(deck, 'nextSteps')).toHaveLength(2)
  })

  it('never lets a colon start a line: the space before it does not break', () => {
    const deck = buildDeck(
      input({
        project: { name: 'P', goal: 'Il faut :\n- trouver', team: null },
        insights: [insight('a', { statement: bi('Deux usages : « voir » et faire !') })],
      }),
    )
    expect(find(deck, 'context')[0]?.goal).toBe('Il faut\u202f:\n- trouver')
    expect(find(deck, 'insight')[0]?.statement).toBe(
      'Deux usages\u202f: «\u202fvoir\u202f» et faire\u202f!',
    )
  })

  it('has a fingerprint that changes with its content only', () => {
    expect(fingerprintOf(buildDeck(input()))).toBe(fingerprintOf(buildDeck(input())))
    expect(fingerprintOf(buildDeck(input()))).not.toBe(
      fingerprintOf(buildDeck(input({ recommendations: [rec('r1', { effort: 'high' })] }))),
    )
  })
})

describe('presentationOf (spec 015 FR-007, SC-003)', () => {
  it('writes each slide in the chosen language, "to validate" in words, the matrix with its quadrants', () => {
    const pages = presentationOf(
      buildDeck(
        input({
          language: 'fr',
          withProposed: true,
          recommendations: [rec('r1', { status: 'proposed' })],
        }),
      ),
      'fr',
    )
    expect(pages[0]).toMatchObject({ title: 'Finding data', cover: true })
    expect(pages[0]?.lines?.[1]).toBe(
      '6 entretiens · 1 octobre 2026 – 20 octobre 2026 · 6 participants · Équipe Research',
    )
    // French typography: the space before a colon never breaks (review of PR #15).
    expect(pages.flatMap((p) => p.lines ?? []).some((l) => / :/.test(l))).toBe(false)
    const matrix = pages.find((p) => p.title === 'Impact × effort')
    expect(matrix?.table?.rows[0]?.[1]).toBe('Gains rapides\u202f: 1 (à valider)')
    expect(pages.find((p) => p.title === 'Qui fait quoi')?.table?.rows[0]).toEqual([
      'Do r1 (fr) (à valider)',
      'Data team',
      'Less time lost (fr)',
    ])
    expect(pages.at(-1)).toMatchObject({ title: 'Merci\u202f!', cover: true })
    // The bilingual glossary, and the method in the same words as the app (review of PR #15).
    const recs = pages.find((p) => p.title === 'Ce que nous recommandons')
    expect(recs?.table?.header).toContain('Type')
    expect(pages.find((p) => p.title === 'Qui fait quoi')?.table?.header).toContain(
      'Mesure du succès',
    )
    expect(pages.find((p) => p.title === 'Comment nous avons mené la recherche')?.lines).toContain(
      'Entretiens individuels enregistrés et transcrits.',
    )
    expect(
      presentationOf(
        buildDeck(input({ language: 'fr', recommendations: [rec('r1', { kind: 'investigate' })] })),
        'fr',
      ).find((p) => p.title === 'Ce que nous recommandons')?.table?.rows[0]?.[2],
    ).toBe('Investiguer')
  })
})
