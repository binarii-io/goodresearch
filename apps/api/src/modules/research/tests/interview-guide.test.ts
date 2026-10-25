import { GUIDE_LIMITS, GuideContentInput } from '@goodresearch/contracts'
import { describe, expect, it } from 'vitest'
import { type GuideInput, InterviewGuide } from '../domain/interview-guide.ts'

const t0 = new Date('2026-10-25T10:00:00Z')
const t1 = new Date('2026-10-25T11:00:00Z')

const ids = () => {
  let n = 0
  return () => `id-${++n}`
}

const input = (overrides: Partial<GuideInput> = {}): GuideInput => ({
  framing: {
    objectives: 'Understand how people plan their week',
    hypotheses: ['People plan on Sunday evening'],
    audience: '8 people who plan for a family',
    format: '45 minutes, video call, recorded',
  },
  sections: [
    { kind: 'introduction', title: 'Introduction', minutes: 5, questions: [] },
    {
      kind: 'theme',
      title: 'Planning',
      minutes: 30,
      questions: [
        { text: 'Tell me about the last time you planned your week.', followUps: ['And then?'] },
        { text: 'How do you keep track of changes?', followUps: [] },
      ],
    },
    { kind: 'wrap-up', title: 'Wrap-up', minutes: 5, questions: [] },
  ],
  ...overrides,
})

const create = (content: GuideInput = input(), newId = ids()) =>
  InterviewGuide.create({ studyId: 's1', content, origin: 'assistant', by: 'a1', now: t0, newId })

const questionsOf = (guide: InterviewGuide) =>
  guide.snapshot().content.sections.flatMap((s) => s.questions)

describe('InterviewGuide', () => {
  it('trims texts and gives every section and question an id', () => {
    const result = create(
      input({
        framing: { objectives: '  Goal  ', hypotheses: [' H1 '], audience: '', format: '' },
      }),
    )
    if (!result.ok) throw new Error('fixture')
    const content = result.value.snapshot().content
    expect(content.framing).toEqual({
      objectives: 'Goal',
      hypotheses: ['H1'],
      audience: '',
      format: '',
    })
    expect(content.sections.map((s) => s.id)).toEqual(['id-1', 'id-2', 'id-3'])
    expect(questionsOf(result.value).map((q) => q.id)).toEqual(['id-4', 'id-5'])
    expect(result.value.snapshot()).toMatchObject({ version: 0, origin: 'assistant' })
  })

  it('enforces the limits of FR-002', () => {
    const question = { text: 'Q?', followUps: [] }
    const theme = (n: number) => ({
      kind: 'theme' as const,
      title: 'T',
      minutes: 10,
      questions: Array.from({ length: n }, () => question),
    })
    const invalid = { ok: false, error: 'VALIDATION' }
    expect(create(input({ sections: [] }))).toEqual(invalid)
    expect(create(input({ sections: Array.from({ length: 13 }, () => theme(1)) }))).toEqual(invalid)
    expect(create(input({ sections: Array.from({ length: 12 }, () => theme(5)) })).ok).toBe(true)
    expect(create(input({ sections: [theme(60), theme(1)] }))).toEqual(invalid)
    expect(create(input({ sections: [{ ...theme(1), minutes: 0 }] }))).toEqual(invalid)
    expect(create(input({ sections: [{ ...theme(1), minutes: 181 }] }))).toEqual(invalid)
    expect(create(input({ sections: [{ ...theme(1), minutes: 1.5 }] }))).toEqual(invalid)
    expect(create(input({ sections: [{ ...theme(1), title: ' ' }] }))).toEqual(invalid)
    expect(
      create(input({ sections: [{ ...theme(0), questions: [{ text: ' ', followUps: [] }] }] })),
    ).toEqual(invalid)
    expect(
      create(
        input({
          sections: [{ ...theme(0), questions: [{ text: 'a'.repeat(601), followUps: [] }] }],
        }),
      ),
    ).toEqual(invalid)
    expect(
      create(
        input({
          sections: [{ ...theme(0), questions: [{ text: 'Q', followUps: Array(9).fill('Why?') }] }],
        }),
      ),
    ).toEqual(invalid)
    const framing = input().framing
    expect(create(input({ framing: { ...framing, objectives: 'a'.repeat(4001) } }))).toEqual(
      invalid,
    )
    expect(create(input({ framing: { ...framing, hypotheses: Array(16).fill('H') } }))).toEqual(
      invalid,
    )
    expect(create(input({ framing: { ...framing, hypotheses: [''] } }))).toEqual(invalid)
  })

  it('uses the same limits as the API contract', () => {
    expect(GUIDE_LIMITS).toMatchObject({ sections: 12, questions: 60, followUps: 8, text: 600 })
    expect(GuideContentInput.safeParse(input()).success).toBe(true)
  })

  it('keeps question ids sent by the editor and matches the others by text (research R4)', () => {
    const created = create()
    if (!created.ok) throw new Error('fixture')
    const guide = created.value
    const [first, second] = questionsOf(guide)
    if (!first || !second) throw new Error('fixture')
    const next = input({
      sections: [
        {
          kind: 'theme',
          title: 'Planning',
          minutes: 30,
          questions: [
            // Reworded by hand: keeps its id.
            { id: first.id, text: 'Tell me about last week.', followUps: [] },
            // Same text, other case and spaces, no id (the assistant): matched. The section is
            // matched by its title.
            { text: '  how do you keep   track of CHANGES? ', followUps: [] },
            { text: 'A new question', followUps: [] },
          ],
        },
      ],
    })
    const newId = ids()
    expect(guide.replace({ content: next, origin: 'person', by: 'a2', now: t1, newId })).toEqual({
      ok: true,
      value: undefined,
    })
    expect(questionsOf(guide).map((q) => q.id)).toEqual([first.id, second.id, 'id-1'])
    expect(guide.snapshot()).toMatchObject({ origin: 'person', updatedBy: 'a2', updatedAt: t1 })
  })

  it('never gives one id to two questions', () => {
    const created = create()
    if (!created.ok) throw new Error('fixture')
    const guide = created.value
    const [first] = questionsOf(guide)
    if (!first) throw new Error('fixture')
    const same = { id: first.id, text: first.text, followUps: [] }
    guide.replace({
      content: input({
        sections: [{ kind: 'theme', title: 'T', minutes: 10, questions: [same, same] }],
      }),
      origin: 'person',
      by: 'a1',
      now: t1,
      newId: ids(),
    })
    const after = questionsOf(guide).map((q) => q.id)
    expect(new Set(after).size).toBe(2)
    expect(after[0]).toBe(first.id)
  })

  it('ignores ids that were never in the guide', () => {
    const created = create()
    if (!created.ok) throw new Error('fixture')
    const guide = created.value
    guide.replace({
      content: input({
        sections: [
          {
            id: 'foreign',
            kind: 'theme',
            title: 'T',
            minutes: 10,
            questions: [{ id: 'foreign-q', text: 'Q', followUps: [] }],
          },
        ],
      }),
      origin: 'person',
      by: 'a1',
      now: t1,
      newId: ids(),
    })
    const content = guide.snapshot().content
    expect(content.sections[0]?.id).toBe('id-1')
    expect(content.sections[0]?.questions[0]?.id).toBe('id-2')
  })

  it('keeps an explicitly sent id even when a new question above has the same text', () => {
    const created = create()
    if (!created.ok) throw new Error('fixture')
    const guide = created.value
    const [first] = questionsOf(guide)
    if (!first) throw new Error('fixture')
    guide.replace({
      content: input({
        sections: [
          {
            kind: 'theme',
            title: 'Planning',
            minutes: 30,
            questions: [
              { text: first.text, followUps: [] },
              { id: first.id, text: first.text, followUps: [] },
            ],
          },
        ],
      }),
      origin: 'person',
      by: 'a1',
      now: t1,
      newId: ids(),
    })
    expect(questionsOf(guide).map((q) => q.id)).toEqual(['id-1', first.id])
  })
})
