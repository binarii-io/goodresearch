import { describe, expect, it } from 'vitest'
import {
  applyToGuide,
  type GuideContent,
  guideItems,
  readGuide,
  renderGuide,
  validGuideItem,
} from '../domain/guide.ts'
import type { DocModel } from '../domain/model.ts'
import { renderPractices } from '../domain/practices.ts'
import {
  appScheduleItems,
  type PlannedRow,
  readScheduleItems,
  renderSchedule,
  validRow,
} from '../domain/schedule.ts'
import { threeWay } from '../domain/three-way.ts'

const guide: GuideContent = {
  framing: {
    objectives: 'Understand planning\n\nfor families',
    hypotheses: ['Sunday evening'],
    audience: 'Eight people',
    format: '',
  },
  sections: [
    { id: 's1', kind: 'introduction', title: 'Introduction', minutes: 5, questions: [] },
    {
      id: 's2',
      kind: 'theme',
      title: 'Planning',
      minutes: 30,
      questions: [
        { id: 'q1', text: 'Tell me about last week.', followUps: ['And then?'] },
        { id: 'q2', text: 'How do you track changes?', followUps: [] },
      ],
    },
  ],
}

const doc = renderGuide(guide, 'Study A', 'en')
const edit = (d: DocModel, from: string, to: string): DocModel => ({
  blocks: d.blocks.map((b) => (b.text === from ? { ...b, text: to } : b)),
})

describe('guide document (spec 007 research R3, R5)', () => {
  it('renders anchored framing, sections and questions, with follow-ups nested', () => {
    expect(doc.blocks.slice(0, 5)).toEqual([
      { kind: 'heading', level: 1, text: 'Interview guide · Study A' },
      { kind: 'heading', level: 2, text: 'Framing', anchor: 'framing' },
      { kind: 'heading', level: 3, text: 'Objectives', anchor: 'framing:objectives' },
      { kind: 'paragraph', text: 'Understand planning' },
      { kind: 'paragraph', text: 'for families' },
    ])
    expect(doc.blocks).toContainEqual({
      kind: 'heading',
      level: 2,
      text: '2. Planning (30 min)',
      anchor: 'section:s2',
    })
    expect(doc.blocks).toContainEqual({ kind: 'listItem', level: 1, text: 'And then?' })
  })

  it('reads back what it rendered: same items as the app guide', () => {
    expect(guideItems(readGuide(doc))).toEqual(guideItems(guide))
  })

  it('reads a reworded question with its identity, an added one without, and unread text', () => {
    const changed: DocModel = {
      blocks: [
        ...edit(doc, 'Tell me about last week.', 'Walk me through last week.').blocks,
        { kind: 'listItem', level: 0, text: 'Who helps you?' },
        { kind: 'paragraph', text: 'A note someone typed' },
      ],
    }
    const read = readGuide(changed)
    expect(read.sections[1]?.questions.map((q) => [q.id, q.text])).toEqual([
      ['q1', 'Walk me through last week.'],
      ['q2', 'How do you track changes?'],
      [null, 'Who helps you?'],
    ])
    expect(read.unread).toEqual(['A note someone typed'])
  })

  it('treats a copied anchor as a new question (first occurrence keeps the identity)', () => {
    const q1 = doc.blocks.find((b) => b.anchor === 'question:q1')
    if (!q1) throw new Error('fixture')
    const read = readGuide({ blocks: [...doc.blocks, { ...q1, text: 'Copy' }] })
    expect(read.sections[1]?.questions.at(-1)).toEqual({ id: null, text: 'Copy', followUps: [] })
  })

  it('reads a section heading without a duration as invalid', () => {
    const read = readGuide(edit(doc, '2. Planning (30 min)', 'Planning'))
    const items = guideItems(read)
    expect(items.get('section:s2')).toEqual({ type: 'section', title: 'Planning', minutes: null })
    expect(validGuideItem(items.get('section:s2'))).toBe(false)
  })
})

describe('three-way comparison (research R6)', () => {
  const base = guideItems(guide)

  it('is in sync when nothing changed, out of date when only the app changed', () => {
    expect(threeWay(base, base, base, validGuideItem)).toEqual({
      changes: [],
      outOfDate: 0,
      state: 'in-sync',
    })
    const app = guideItems({
      ...guide,
      framing: { ...guide.framing, audience: 'Ten people' },
    })
    expect(threeWay(base, app, base, validGuideItem)).toMatchObject({
      outOfDate: 1,
      state: 'out-of-date',
    })
  })

  it('lists Drive changes by kind: changed, added, removed, reordered, not understood', () => {
    const q = doc.blocks.filter(
      (b) => b.anchor !== 'question:q2' && b.text !== 'How do you track changes?',
    )
    const drive: DocModel = {
      blocks: [
        ...edit({ blocks: q }, 'Tell me about last week.', 'Walk me through last week.').blocks,
        { kind: 'listItem', level: 0, text: 'Who helps you?' },
        { kind: 'paragraph', text: 'stray' },
      ],
    }
    const { changes, state } = threeWay(base, base, guideItems(readGuide(drive)), validGuideItem)
    expect(state).toBe('changed-in-drive')
    expect(changes.map((c) => [c.key, c.kind])).toEqual([
      ['question:q1', 'changed'],
      ['question:q2', 'removed'],
      ['order:s2', 'reordered'],
      [expect.stringMatching(/^new:/), 'added'],
      ['unread:1', 'not-understood'],
    ])
  })

  it('is a conflict when both sides changed the same item differently', () => {
    const app = guideItems({
      ...guide,
      sections: guide.sections.map((s) => ({
        ...s,
        questions: s.questions.map((q) => (q.id === 'q1' ? { ...q, text: 'App text' } : q)),
      })),
    })
    const drive = guideItems(readGuide(edit(doc, 'Tell me about last week.', 'Drive text')))
    const { changes, state } = threeWay(base, app, drive, validGuideItem)
    expect(state).toBe('conflict')
    expect(changes).toEqual([expect.objectContaining({ key: 'question:q1', kind: 'conflict' })])
  })

  it('compares values whatever the order of their keys (stored values come back reordered)', () => {
    const stored = new Map(
      [...base].map(([k, v]) => [k, Object.fromEntries(Object.entries(v as object).reverse())]),
    )
    expect(threeWay(stored, base, base, validGuideItem).state).toBe('in-sync')
  })

  it('is in sync for an item changed the same way on both sides', () => {
    const changed = { ...guide, framing: { ...guide.framing, format: 'Remote' } }
    expect(threeWay(base, guideItems(changed), guideItems(changed), validGuideItem).state).toBe(
      'in-sync',
    )
  })
})

describe('applying accepted Drive changes to the guide (research R7)', () => {
  it('rewords, removes, adds at the end of the section and keeps the app order', () => {
    const accepted = new Map<string, unknown>([
      [
        'question:q1',
        { type: 'question', section: 's2', text: 'Walk me through it.', followUps: [] },
      ],
      ['question:q2', undefined],
      ['new:1', { type: 'question', section: 's2', text: 'Who helps?', followUps: ['Why?'] }],
      ['framing:format', { type: 'text', text: 'Remote, 45 min' }],
    ])
    const next = applyToGuide(guide, accepted)
    expect(next.framing.format).toBe('Remote, 45 min')
    expect(next.sections[1]?.questions).toEqual([
      { id: 'q1', text: 'Walk me through it.', followUps: [] },
      { text: 'Who helps?', followUps: ['Why?'] },
    ])
    expect(next.sections[0]?.id).toBe('s1')
  })

  it('applies an accepted order and a section change', () => {
    const next = applyToGuide(
      guide,
      new Map<string, unknown>([
        ['order:s2', { type: 'order', ids: ['q2', 'q1'] }],
        ['section:s2', { type: 'section', title: 'Planning a week', minutes: 25 }],
      ]),
    )
    expect(next.sections[1]).toMatchObject({ title: 'Planning a week', minutes: 25 })
    expect(next.sections[1]?.questions.map((q) => q.id)).toEqual(['q2', 'q1'])
  })
})

describe('schedule table (research R3, R5)', () => {
  const rows: PlannedRow[] = [
    {
      id: 'r1',
      interviewee: 'Sam',
      role: 'Planner',
      interviewers: 'Alex',
      scheduledAt: '2026-11-02T14:00:00.000Z',
      status: 'scheduled',
      notes: '',
    },
    {
      id: 'r2',
      interviewee: 'Lee',
      role: '',
      interviewers: '',
      scheduledAt: null,
      status: 'to-contact',
      notes: '',
    },
  ]
  const table = renderSchedule(rows, 'fr', 'Europe/Paris')
  const asRead = { headers: table.columns.map((c) => c.title), idColumn: true, rows: table.rows }

  it('renders localised titles and statuses, and reads them back as the same items', () => {
    expect(table.columns.map((c) => c.title)).toContain('Statut')
    expect(table.rows[0]?.cells.status).toBe('Planifié')
    expect(readScheduleItems(asRead, 'fr')).toEqual(appScheduleItems(rows))
  })

  it('reads changed cells, rows added without id, unknown statuses and missing columns', () => {
    const read = {
      headers: asRead.headers,
      idColumn: true,
      rows: [
        { id: 'r1', cells: { ...asRead.rows[0]?.cells, status: 'Réalisé' } },
        { id: 'r1', cells: { interviewee: 'Copied row', status: 'Done' } },
        { id: null, cells: { interviewee: 'New', status: 'peut-être' } },
      ],
    }
    const items = readScheduleItems(read, 'fr')
    expect(items.get('row:r1')).toMatchObject({ status: 'done' })
    const added = [...items.keys()].filter((k) => k.startsWith('new-row:'))
    expect(added).toHaveLength(2)
    expect(items.get(added[0] ?? '')).toMatchObject({ interviewee: 'Copied row', status: 'done' })
    expect(validRow(items.get(added[1] ?? ''))).toBe(false)
    const { changes } = threeWay(appScheduleItems(rows), appScheduleItems(rows), items, validRow)
    expect(changes.map((c) => [c.key, c.kind])).toEqual([
      ['row:r1', 'changed'],
      ['row:r2', 'removed'],
      [expect.stringMatching(/^new-row:/), 'added'],
      [expect.stringMatching(/^new-row:/), 'invalid'],
    ])
  })

  it('does not read a renamed column as emptied: rows cannot be accepted (PR #7 review)', () => {
    const read = {
      headers: asRead.headers.map((h) => (h === 'Notes' ? 'Commentaires' : h)),
      idColumn: true,
      rows: asRead.rows,
    }
    const items = readScheduleItems(read, 'fr')
    expect(items.get('unread:structure')).toEqual({ type: 'unread', text: 'Notes' })
    expect(validRow(items.get('row:r1'))).toBe(false)
  })
})

describe('identity of added and unanchored items (PR #7 review)', () => {
  it('keeps the key of an added row when another row is inserted above it', () => {
    const headers = [
      'Person to interview',
      'Role',
      'Interviewer(s)',
      'Date and time',
      'Status',
      'Notes',
    ]
    const a = { id: null, cells: { interviewee: 'A', status: 'Done' } }
    const b = { id: null, cells: { interviewee: 'B', status: 'Done' } }
    const keyOf = (rows: (typeof a)[], name: string) =>
      [...readScheduleItems({ headers, idColumn: true, rows }, 'en')].find(
        ([, v]) => (v as { interviewee?: string }).interviewee === name,
      )?.[0]
    expect(keyOf([b, a], 'A')).toBe(keyOf([a], 'A'))
  })

  it('keeps the questions of a section whose heading lost its anchor (never "removed")', () => {
    const blocks = doc.blocks.map((b) =>
      b.anchor === 'section:s2' ? { kind: b.kind, level: 2 as const, text: 'Retyped (30 min)' } : b,
    )
    const items = guideItems(readGuide({ blocks: blocks as DocModel['blocks'] }))
    expect(items.get('question:q1')).toMatchObject({
      section: null,
      text: 'Tell me about last week.',
    })
    const { changes } = threeWay(guideItems(guide), guideItems(guide), items, validGuideItem)
    expect(changes.some((c) => c.kind === 'removed' && c.key.startsWith('question:'))).toBe(false)
  })
})

describe('best practices document', () => {
  it('renders the content of the language without Markdown marks', () => {
    const blocks = renderPractices('fr').blocks
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Bonnes pratiques d’entretien' })
    expect(blocks.some((b) => b.text.includes('**'))).toBe(false)
  })
})
