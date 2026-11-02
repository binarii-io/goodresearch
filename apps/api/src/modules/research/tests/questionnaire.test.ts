import { describe, expect, it } from 'vitest'
import {
  Questionnaire,
  type QuestionnaireInput,
  type QuestionnaireItemInput,
} from '../domain/questionnaire.ts'

const now = new Date('2026-11-02T10:00:00Z')
let n = 0
const newId = () => `id-${++n}`

const likert = (text: string, id?: string): QuestionnaireItemInput => ({
  id,
  text,
  measure: 'subjective',
  required: true,
  subTheme: null,
  contact: false,
  kind: 'likert',
  points: 7,
  lowLabel: 'Strongly disagree',
  highLabel: 'Strongly agree',
})

const input = (over: Partial<QuestionnaireInput> = {}): QuestionnaireInput => ({
  framing: {
    objective: 'Measure how teams feel about planning',
    hypotheses: [],
    audience: 'Team leads',
    recruitment: 'targeted',
    administration: 'Online, alone',
    targetResponses: 100,
    targetReason: 'Enough to compare two teams',
    language: 'en',
    consent: 'You choose to take part. There is no right or wrong answer.',
    thanks: 'Thank you.',
    shuffle: true,
  },
  sections: [{ kind: 'theme', title: 'Planning', items: [likert('Planning is easy for me')] }],
  ...over,
})

const create = (content: QuestionnaireInput) =>
  Questionnaire.create({ studyId: 's', content, origin: 'person', by: 'a', now, newId })

const invalid = (content: QuestionnaireInput) =>
  expect(create(content)).toEqual({ ok: false, error: 'VALIDATION' })

describe('Questionnaire', () => {
  it('is created at version 0 with ids and its origin', () => {
    const q = create(input())
    expect(q.ok).toBe(true)
    if (!q.ok) return
    const p = q.value.snapshot()
    expect(p.version).toBe(0)
    expect(p.origin).toBe('person')
    expect(p.content.sections[0]?.id).toBeTruthy()
    expect(p.content.sections[0]?.items[0]?.id).toBeTruthy()
  })

  it('requires a consent and thanks text', () => {
    const framing = input().framing
    invalid(input({ framing: { ...framing, consent: '  ' } }))
    invalid(input({ framing: { ...framing, thanks: '' } }))
  })

  it('requires a theme section holding an item', () => {
    invalid(input({ sections: [{ kind: 'profiling', title: 'You', items: [likert('Age')] }] }))
    invalid(input({ sections: [{ kind: 'theme', title: 'Empty', items: [] }] }))
  })

  it('holds at most 12 sections, 80 items and 15 hypotheses', () => {
    const section = { kind: 'theme' as const, title: 'T', items: [likert('Item')] }
    invalid(input({ sections: Array.from({ length: 13 }, () => section) }))
    invalid(
      input({
        sections: [
          {
            kind: 'theme',
            title: 'T',
            items: Array.from({ length: 81 }, (_, i) => likert(`Item ${i}`)),
          },
        ],
      }),
    )
    invalid(
      input({
        framing: { ...input().framing, hypotheses: Array.from({ length: 16 }, () => 'H') },
      }),
    )
  })

  it('limits item, option, framing and title lengths', () => {
    const long = (size: number) => 'x'.repeat(size)
    invalid(input({ sections: [{ kind: 'theme', title: 'T', items: [likert(long(601))] }] }))
    invalid(input({ sections: [{ kind: 'theme', title: long(121), items: [likert('I')] }] }))
    invalid(input({ framing: { ...input().framing, objective: long(4001) } }))
    invalid(
      input({
        sections: [
          {
            kind: 'theme',
            title: 'T',
            items: [
              {
                text: 'Pick',
                measure: 'factual',
                required: true,
                subTheme: null,
                contact: false,
                kind: 'single-choice',
                options: [long(601), 'B'],
                ordered: false,
              },
            ],
          },
        ],
      }),
    )
  })

  it('accepts Likert scales of 5 or 7 points only', () => {
    const scale = (points: number) =>
      input({
        sections: [
          {
            kind: 'theme',
            title: 'T',
            items: [{ ...likert('I'), points } as QuestionnaireItemInput],
          },
        ],
      })
    expect(create(scale(5)).ok).toBe(true)
    expect(create(scale(7)).ok).toBe(true)
    invalid(scale(4))
  })

  it('requires 2 to 20 options on a choice', () => {
    const choice = (options: string[]) =>
      input({
        sections: [
          {
            kind: 'theme',
            title: 'T',
            items: [
              {
                text: 'Pick',
                measure: 'factual',
                required: true,
                subTheme: null,
                contact: false,
                kind: 'multiple-choice',
                options,
                ordered: false,
              },
            ],
          },
        ],
      })
    invalid(choice(['Only']))
    invalid(choice(Array.from({ length: 21 }, (_, i) => `O${i}`)))
    expect(create(choice(['A', 'B'])).ok).toBe(true)
  })

  it('puts an item on one line, and refuses two identical options', () => {
    const choice = (options: string[], text = 'Pick\none') =>
      input({
        sections: [
          {
            kind: 'theme',
            title: 'T',
            items: [
              {
                text,
                measure: 'factual',
                required: true,
                subTheme: null,
                contact: false,
                kind: 'single-choice',
                options,
                ordered: false,
              },
            ],
          },
        ],
      })
    invalid(choice(['A', ' A ']))
    const made = create(choice(['A', 'B']))
    if (!made.ok) throw new Error('not created')
    expect(made.value.snapshot().content.sections[0]?.items[0]?.text).toBe('Pick one')
  })

  it('allows a sub-theme only in a theme section', () => {
    const theme = input().sections[0]
    if (!theme) throw new Error('no section')
    invalid(
      input({
        sections: [
          theme,
          {
            kind: 'profiling',
            title: 'You',
            items: [{ ...likert('Age'), subTheme: 'Sub' }],
          },
        ],
      }),
    )
    expect(
      create(
        input({
          sections: [{ ...theme, items: [{ ...likert('I'), subTheme: 'Sub' }] }],
        }),
      ).ok,
    ).toBe(true)
  })

  const contact = (over = {}): QuestionnaireItemInput => ({
    text: 'Your address, to receive the results',
    measure: 'factual',
    required: false,
    subTheme: null,
    contact: true,
    kind: 'open',
    ...over,
  })

  it('holds one contact item at most: open, not required, in the closing section', () => {
    const theme = input().sections[0]
    if (!theme) throw new Error('no section')
    const closing = (items: QuestionnaireItemInput[]) =>
      input({ sections: [theme, { kind: 'closing', title: 'End', items }] })
    expect(create(closing([contact()])).ok).toBe(true)
    invalid(closing([contact(), contact({ text: 'Another' })]))
    invalid(closing([contact({ required: true })]))
    invalid(closing([{ ...likert('Scale'), contact: true }]))
    invalid(
      input({
        sections: [{ ...theme, items: [...theme.items, contact()] }],
      }),
    )
  })

  it('keeps an item id when the id is sent, or when the text is the same', () => {
    const q = create(input())
    if (!q.ok) throw new Error('not created')
    const first = q.value.snapshot().content.sections[0]?.items[0]
    if (!first) throw new Error('no item')
    const replaced = q.value.replace({
      content: input({
        sections: [
          {
            kind: 'theme',
            title: 'Planning',
            items: [likert('  PLANNING  is easy for me '), likert('A new item')],
          },
        ],
      }),
      origin: 'assistant',
      by: 'b',
      now,
      newId,
    })
    expect(replaced.ok).toBe(true)
    const items = q.value.snapshot().content.sections[0]?.items
    expect(items?.[0]?.id).toBe(first.id)
    expect(items?.[1]?.id).not.toBe(first.id)
    expect(q.value.snapshot().origin).toBe('assistant')

    q.value.replace({
      content: input({
        sections: [{ kind: 'theme', title: 'Planning', items: [likert('Reworded', first.id)] }],
      }),
      origin: 'person',
      by: 'b',
      now,
      newId,
    })
    expect(q.value.snapshot().content.sections[0]?.items[0]?.id).toBe(first.id)
  })
})
