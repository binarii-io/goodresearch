import { describe, expect, it } from 'vitest'
import {
  applyToQuestionnaire,
  type FormBlock,
  type FormReadBlock,
  formItems,
  impactOfUpdate,
  mapFromRead,
  planFormUpdate,
  type QuestionnaireContent,
  questionnaireItems,
  renderForm,
  validFormItem,
} from '../domain/form.ts'

const common = { measure: 'subjective', required: true, subTheme: null, contact: false } as const
const likert = (id: string, text = `Scale ${id}`, over: object = {}) =>
  ({
    ...common,
    id,
    text,
    kind: 'likert',
    points: 7,
    lowLabel: 'Disagree',
    highLabel: 'Agree',
    ...over,
  }) as const
const open = (id: string) => ({ ...common, id, text: `Open ${id}`, kind: 'open' }) as const
const choice = (id: string, ordered = false) =>
  ({
    ...common,
    measure: 'factual',
    id,
    text: `Choice ${id}`,
    kind: 'single-choice',
    options: ['A', 'B'],
    ordered,
  }) as const

const questionnaire = (
  items: QuestionnaireContent['sections'][number]['items'],
  shuffle = true,
): QuestionnaireContent => ({
  framing: {
    objective: '',
    hypotheses: [],
    audience: '',
    recruitment: 'targeted',
    administration: '',
    targetResponses: null,
    targetReason: '',
    language: 'en',
    consent: 'You choose.',
    thanks: 'Thank you.',
    shuffle,
  },
  sections: [{ id: 's1', kind: 'theme', title: 'Planning', items }],
})

/** What the source would give back for a rendered form. */
const toRead = (blocks: readonly FormBlock[]): FormReadBlock[] =>
  blocks.map((b, i) => {
    const { key: _key, ...rest } = b
    return {
      ...rest,
      formItemId: `f${i}`,
      questionId: b.kind === 'section' || b.kind === 'text' || b.kind === 'grid' ? null : `q${i}`,
      ...(b.kind === 'grid'
        ? { rows: b.rows.map((r, j) => ({ ...r, questionId: `q${i}-${j}` })) }
        : {}),
    } as FormReadBlock
  })

describe('renderForm', () => {
  it('starts with the consent, whose refusal ends the form, and ends with the thanks', () => {
    const { blocks } = renderForm(questionnaire([open('a')]), 'Study')
    const first = blocks[0]
    expect(first).toMatchObject({ kind: 'choice', required: true, multiple: false, shuffle: false })
    if (first?.kind !== 'choice') throw new Error('kind')
    expect(first.description).toBe('You choose.')
    expect(first.options.map((o) => o.exit)).toEqual([false, true])
    expect(blocks.at(-1)).toMatchObject({ kind: 'text', description: 'Thank you.' })
  })

  it('makes one grid of consecutive scales sharing a legend, with labels in the end columns', () => {
    const { blocks } = renderForm(questionnaire([likert('a'), likert('b')]), 'Study')
    const grid = blocks.find((b) => b.kind === 'grid')
    if (grid?.kind !== 'grid') throw new Error('no grid')
    expect(grid.rows.map((r) => r.key)).toEqual(['item:a', 'item:b'])
    expect(grid.shuffle).toBe(true)
    expect(grid.columns).toEqual(['1 – Disagree', '2', '3', '4', '5', '6', '7 – Agree'])
  })

  it('splits grids on another legend and on an item in between; one scale stays a scale', () => {
    const kinds = (items: Parameters<typeof questionnaire>[0]) =>
      renderForm(questionnaire(items), 'S')
        .blocks.slice(2, -1)
        .map((b) => b.kind)
    expect(kinds([likert('a'), likert('b'), open('o'), likert('c'), likert('d')])).toEqual([
      'grid',
      'open',
      'grid',
    ])
    expect(kinds([likert('a'), likert('b', 'B', { points: 5 })])).toEqual(['scale', 'scale'])
    expect(kinds([likert('a')])).toEqual(['scale'])
  })

  it('makes no grid with the shuffle off', () => {
    const { blocks } = renderForm(questionnaire([likert('a'), likert('b')], false), 'S')
    expect(blocks.filter((b) => b.kind === 'grid')).toEqual([])
    expect(blocks.filter((b) => b.kind === 'scale')).toHaveLength(2)
  })

  it('shuffles choices, except ordered ones', () => {
    const blocks = renderForm(questionnaire([choice('a'), choice('b', true)]), 'S').blocks.filter(
      (b) => b.kind === 'choice' && b.key.startsWith('item:'),
    )
    expect(blocks.map((b) => (b.kind === 'choice' ? b.shuffle : null))).toEqual([true, false])
  })
})

describe('reading back', () => {
  const content = questionnaire([likert('a'), likert('b'), open('c'), choice('d')])
  const model = renderForm(content, 'S')
  const read = toRead(model.blocks)
  const map = mapFromRead(model, read)

  it('maps each item to its identity at the source, grid rows included', () => {
    expect(map['item:a']).toEqual({ formItemId: 'f2', questionId: 'q2-0' })
    expect(map['item:b']).toEqual({ formItemId: 'f2', questionId: 'q2-1' })
    expect(map['item:c']).toEqual({ formItemId: 'f3', questionId: 'q3' })
    expect(map.consent?.formItemId).toBe('f0')
    expect(map['section:s1']?.formItemId).toBe('f1')
  })

  it('compares equal to the app right after writing', () => {
    expect(Object.fromEntries(formItems(read, map))).toEqual(
      Object.fromEntries(questionnaireItems(content)),
    )
  })

  it('reads a changed wording under the same item', () => {
    const edited = read.map((b) => (b.formItemId === 'f3' ? { ...b, title: 'New words' } : b))
    expect(formItems(edited, map).get('item:c')).toMatchObject({ text: 'New words' })
  })

  it('reads an added supported question as new, an unsupported one as unread', () => {
    const items = formItems(
      [
        ...read,
        {
          formItemId: 'n1',
          questionId: 'n1q',
          kind: 'open',
          title: 'Added',
          description: '',
          required: false,
        },
        {
          formItemId: 'n2',
          questionId: null,
          kind: 'unsupported',
          title: 'A file',
          description: '',
        },
      ],
      map,
    )
    expect(items.get('new:n1:n1q')).toMatchObject({ type: 'item', text: 'Added' })
    expect(items.get('unread:n2')).toMatchObject({ type: 'unread', text: 'A file' })
  })

  it('reports a consent that no longer leads out', () => {
    const edited = read.map((b) =>
      b.formItemId === 'f0' && b.kind === 'choice'
        ? { ...b, options: b.options.map((o) => ({ ...o, exit: false })) }
        : b,
    )
    const value = formItems(edited, map).get('consent')
    expect(value).toMatchObject({ exits: false })
    expect(validFormItem(value)).toBe(false)
    expect(validFormItem(formItems(read, map).get('consent'))).toBe(true)
  })

  it('refuses invalid values', () => {
    expect(validFormItem({ type: 'item', kind: 'open', text: '', required: true })).toBe(false)
    expect(
      validFormItem({ type: 'item', kind: 'open', text: 'x'.repeat(601), required: true }),
    ).toBe(false)
    expect(
      validFormItem({
        type: 'item',
        kind: 'likert',
        text: 'A',
        required: true,
        points: 4,
        lowLabel: 'L',
        highLabel: 'H',
      }),
    ).toBe(false)
    expect(
      validFormItem({
        type: 'item',
        kind: 'single-choice',
        text: 'A',
        required: true,
        options: ['One'],
      }),
    ).toBe(false)
  })
})

describe('planFormUpdate', () => {
  const content = questionnaire([likert('a'), likert('b'), open('c'), choice('d')])
  const model = renderForm(content, 'S')
  const read = toRead(model.blocks)
  const map = mapFromRead(model, read)
  const plan = (next: QuestionnaireContent, from = read) =>
    planFormUpdate(from, renderForm(next, 'S'), map)

  it('does nothing when nothing changed', () => {
    expect(plan(content)).toEqual([])
  })

  it('updates only what differs, keeping the ids of an item and of grid rows', () => {
    const ops = plan(questionnaire([likert('a', 'Reworded'), likert('b'), open('c'), choice('d')]))
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ type: 'update', index: 2, formItemId: 'f2' })
    const op = ops[0]
    if (op?.type !== 'update' || op.block.kind !== 'grid') throw new Error('kind')
    expect(op.block.rows.map((r) => r.questionId)).toEqual(['q2-0', 'q2-1'])
    expect(op.block.rows[0]?.title).toBe('Reworded')
  })

  it('keeps the ids of the others when a grid gains a row, the new one having none', () => {
    const ops = plan(questionnaire([likert('a'), likert('b'), likert('n'), open('c'), choice('d')]))
    const op = ops[0]
    if (op?.type !== 'update' || op.block.kind !== 'grid') throw new Error('kind')
    expect(op.block.rows.map((r) => r.questionId)).toEqual(['q2-0', 'q2-1', null])
  })

  it('gives a new id to what leaves its form item: the service refuses an id still in use', () => {
    const ops = plan(
      questionnaire([
        likert('a', 'Scale a', { required: false }),
        likert('b'),
        open('c'),
        choice('d'),
      ]),
    )
    const created = ops.find((o) => o.type === 'create')
    if (created?.type !== 'create') throw new Error('no create')
    expect(created.block.questionId).toBeNull()
  })

  it('creates, moves and deletes', () => {
    const ops = plan(questionnaire([choice('d'), likert('a'), likert('b'), open('new')]))
    expect(ops.map((o) => o.type).sort()).toEqual(['create', 'delete', 'move'].sort())
  })

  it('leaves what it does not know in the form, after the known blocks', () => {
    const extra: FormReadBlock = {
      formItemId: 'x',
      questionId: null,
      kind: 'unsupported',
      title: 'A file',
      description: '',
    }
    const ops = plan(content, [...read.slice(0, 2), extra, ...read.slice(2)])
    expect(ops.some((o) => o.type === 'delete')).toBe(false)
    expect(ops.filter((o) => o.type === 'move').length).toBeGreaterThan(0)
  })
})

describe('applyToQuestionnaire', () => {
  const content = questionnaire([likert('a'), open('c')])

  it('applies a changed wording and keeps what the form cannot hold', () => {
    const next = applyToQuestionnaire(
      content,
      new Map([['item:c', { type: 'item', kind: 'open', text: 'New words', required: false }]]),
    )
    const item = next.sections[0]?.items[1]
    expect(item).toMatchObject({
      id: 'c',
      text: 'New words',
      required: false,
      measure: 'subjective',
    })
  })

  it('removes an item, adds a new one to the last theme, and changes the texts', () => {
    const next = applyToQuestionnaire(
      content,
      new Map<string, unknown>([
        ['item:a', undefined],
        ['new:n:q', { type: 'item', kind: 'open', text: 'Added', required: true, section: null }],
        ['consent', { type: 'consent', text: 'New consent', exits: true }],
        ['thanks', { type: 'thanks', text: 'New thanks' }],
        ['section:s1', { type: 'section', title: 'New title' }],
      ]),
    )
    expect(next.sections[0]?.title).toBe('New title')
    expect(next.sections[0]?.items.map((i) => i.text)).toEqual(['Open c', 'Added'])
    expect(next.framing.consent).toBe('New consent')
    expect(next.framing.thanks).toBe('New thanks')
  })

  it('does not fail on a section gone from the form, and removes it when accepted', () => {
    const next = applyToQuestionnaire(
      content,
      new Map<string, unknown>([
        ['order:section:s1', undefined],
        ['section:s1', undefined],
      ]),
    )
    expect(next.sections).toEqual([])
  })

  it('never removes an item through an order alone', () => {
    const next = applyToQuestionnaire(
      content,
      new Map([['order:section:s1', { type: 'order', ids: ['c'] }]]),
    )
    expect(next.sections[0]?.items.map((i) => i.id).sort()).toEqual(['a', 'c'])
  })

  it('keeps every section when only the order of some is accepted', () => {
    const next = applyToQuestionnaire(
      content,
      new Map([['order:sections', { type: 'order', ids: [] }]]),
    )
    expect(next.sections).toHaveLength(1)
  })

  it('keeps the contact item optional and open, whatever the form says', () => {
    const withContact = questionnaire([
      { ...common, id: 'k', text: 'Address', kind: 'open', contact: true, required: false },
    ])
    const next = applyToQuestionnaire(
      withContact,
      new Map([['item:k', { type: 'item', kind: 'likert', text: 'New', required: true }]]),
    )
    expect(next.sections[0]?.items[0]).toMatchObject({
      text: 'New',
      kind: 'open',
      contact: true,
      required: false,
    })
  })

  it('applies an order', () => {
    const next = applyToQuestionnaire(
      content,
      new Map([['order:section:s1', { type: 'order', ids: ['c', 'a'] }]]),
    )
    expect(next.sections[0]?.items.map((i) => i.id)).toEqual(['c', 'a'])
  })
})

describe('impactOfUpdate', () => {
  const before = questionnaire([likert('a'), likert('b'), open('c'), choice('d')])
  const base = questionnaireItems(before)
  const impact = (next: QuestionnaireContent) => impactOfUpdate(base, questionnaireItems(next))

  it('sees nothing when nothing changed', () => {
    expect(impact(before)).toEqual({ breaking: [], reworded: [] })
  })

  it('lets an addition through, even inside a grid', () => {
    expect(
      impact(questionnaire([likert('a'), likert('b'), likert('n'), open('c'), choice('d')])),
    ).toEqual({ breaking: [], reworded: [] })
  })

  it('tells a rewording', () => {
    expect(
      impact(questionnaire([likert('a', 'New'), likert('b'), open('c'), choice('d')])),
    ).toEqual({ breaking: [], reworded: ['a'] })
  })

  it('breaks on an item removed', () => {
    expect(impact(questionnaire([likert('a'), likert('b'), open('c')])).breaking).toEqual(['d'])
  })

  it('breaks on a change of kind, scale or options', () => {
    expect(
      impact(
        questionnaire([likert('a'), likert('b', 'Scale b', { points: 5 }), open('c'), choice('d')]),
      ).breaking,
    ).toContain('b')
    expect(
      impact(
        questionnaire([
          likert('a'),
          likert('b'),
          open('c'),
          { ...choice('d'), options: ['A', 'Z'] },
        ]),
      ).breaking,
    ).toEqual(['d'])
  })

  it('breaks when a scale leaves its grid, or the shuffle setting undoes the grid', () => {
    expect(
      impact(questionnaire([likert('a'), open('c'), likert('b'), choice('d')])).breaking.sort(),
    ).toEqual(['a', 'b'])
    expect(
      impact(
        questionnaire([likert('a'), likert('b'), open('c'), choice('d')], false),
      ).breaking.sort(),
    ).toEqual(['a', 'b'])
  })
})
