import { describe, expect, it } from 'vitest'
import { batches, factLines } from '../domain/fact-lines.ts'
import {
  checkInsights,
  type Insight,
  type InsightAnswer,
  isReproposal,
  mergeInsights,
  removePercentages,
} from '../domain/insights.ts'

const at = new Date('2026-10-29T10:00:00Z')
const bi = (en: string, fr = en) => ({ en, fr })
const answer = (over: Partial<InsightAnswer> = {}): InsightAnswer => ({
  theme: 't1',
  statement: bi('Teams rebuild reports they cannot find', 'Les équipes refont des rapports'),
  description: bi('They search, then give up.'),
  counterEvidence: bi('None'),
  minorityView: bi('None'),
  support: ['f1', 'f2'],
  counter: [],
  ...over,
})
const refs = new Map([
  ['f1', 'fact-1'],
  ['f2', 'fact-2'],
  ['f3', 'fact-3'],
])
const themes = new Map([
  ['t1', { key: 'finding data', title: 'Finding data' }],
  ['other', { key: 'other', title: null }],
])
const participants = new Map([
  ['fact-1', ['st|P01']],
  ['fact-2', ['st|P02']],
  ['fact-3', ['st|P03']],
])

describe('factLines (research R2, R3)', () => {
  const fact = (id: string, studyId: string, theme: string | null, participant = 'P01') => ({
    id,
    studyId,
    sessionId: `${studyId}-s1`,
    statement: bi(`Statement ${id}`, `Énoncé ${id}`),
    polarity: 'negative' as const,
    theme: theme ? { id: theme, title: theme === 'a' ? 'Finding data' : 'Sharing' } : null,
    participants: [participant],
  })

  it('numbers the facts in study, interview and theme order, with pseudonym codes only', () => {
    const made = factLines(
      [fact('x', 'st2', 'a'), fact('y', 'st1', 'b'), fact('z', 'st1', 'a', 'P02')],
      ['st1', 'st2'],
      'fr',
    )
    expect(made.lines.map((l) => l.text)).toEqual([
      'f1 | negative | t1 | S1-P02 | Énoncé z',
      'f2 | negative | t2 | S1-P01 | Énoncé y',
      'f3 | negative | t1 | S2-P01 | Énoncé x',
    ])
    expect(made.refs.get('f1')).toBe('z')
    expect(made.themes.get('t1')).toEqual({ key: 'finding data', title: 'Finding data' })
  })

  it('writes the bare code with one study, and "other" without theme', () => {
    const made = factLines([fact('x', 'st1', null)], ['st1'], 'en')
    expect(made.lines[0]?.text).toBe('f1 | negative | other | P01 | Statement x')
  })

  it('merges guide themes of several studies by their title', () => {
    const one = { ...fact('x', 'st1', 'a'), theme: { id: 'a', title: 'Finding data' } }
    const two = { ...fact('y', 'st2', 'b'), theme: { id: 'b', title: 'finding  DATA' } }
    expect(factLines([one, two], ['st1', 'st2'], 'en').themes.size).toBe(2)
  })

  it('splits the lines by theme under the size limit', () => {
    const lines = [
      { ref: 'f1', theme: 't1', text: 'a'.repeat(30) },
      { ref: 'f2', theme: 't2', text: 'b'.repeat(30) },
      { ref: 'f3', theme: 't1', text: 'c'.repeat(30) },
    ]
    expect(batches(lines, 1000).map((b) => b.map((l) => l.ref))).toEqual([['f1', 'f2', 'f3']])
    expect(batches(lines, 70).map((b) => b.map((l) => l.ref))).toEqual([['f1', 'f3'], ['f2']])
    expect(batches(lines, 40).map((b) => b.map((l) => l.ref))).toEqual([['f1'], ['f3'], ['f2']])
  })
})

describe('checkInsights (FR-005, research R8)', () => {
  it('keeps known refs only, and drops an insight left without support', () => {
    const { kept, leftOut } = checkInsights(
      [answer({ support: ['f1', 'f9'], counter: ['f3', 'f8'] }), answer({ support: ['f9'] })],
      refs,
      themes,
      [],
      participants,
    )
    expect(leftOut).toBe(1)
    expect(kept[0]).toMatchObject({ support: ['fact-1'], counter: ['fact-3'] })
  })

  it('drops an insight with an unknown theme, a name or a percentage in its statement', () => {
    const { kept, leftOut } = checkInsights(
      [
        answer({ theme: 't7' }),
        answer({ statement: bi('Sam rebuilds reports') }),
        answer({ statement: bi('60% of teams rebuild reports') }),
        answer({ statement: bi('') }),
      ],
      refs,
      themes,
      ['Sam Example'],
      participants,
    )
    expect(kept).toEqual([])
    expect(leftOut).toBe(4)
  })

  it('removes the sentences with a percentage from the other texts', () => {
    const { kept } = checkInsights(
      [answer({ description: bi('They search. About 40 % give up. Then they ask.') })],
      refs,
      themes,
      [],
      participants,
    )
    expect(kept[0]?.description.en).toBe('They search. Then they ask.')
  })

  it('takes a fact out of counter when it also supports', () => {
    const { kept } = checkInsights([answer({ counter: ['f1'] })], refs, themes, [], participants)
    expect(kept[0]?.counter).toEqual([])
  })

  it('keeps at most 25 new insights, those with the most participants first', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      answer({
        statement: bi(`Distinct finding number ${i}`),
        support: i === 29 ? ['f1', 'f2', 'f3'] : ['f1'],
      }),
    )
    const { kept, leftOut } = checkInsights(many, refs, themes, [], participants)
    expect(kept).toHaveLength(25)
    expect(leftOut).toBe(5)
    expect(kept[0]?.statement.en).toBe('Distinct finding number 29')
  })
})

describe('removePercentages', () => {
  it('handles per cent words in both languages', () => {
    expect(removePercentages('One. Half per cent here. Deux. Dix pour cent. Fin.')).toBe(
      'One. Deux. Fin.',
    )
  })
})

const insight = (over: Partial<Insight> = {}): Insight => ({
  id: 'i-1',
  projectId: 'pr',
  theme: { key: 'finding data', title: 'Finding data' },
  statement: bi('Teams rebuild reports they cannot find'),
  description: bi('d'),
  counterEvidence: bi('None'),
  minorityView: bi('None'),
  translation: 'done',
  origin: 'ai',
  status: 'proposed',
  runId: 'r0',
  decidedBy: null,
  decidedAt: null,
  version: 1,
  links: [],
  ...over,
})
const snap = (id: string) => ({
  version: 1,
  polarity: 'negative' as const,
  themeId: 't1',
  statementEn: id,
})
const snapshots = new Map([
  ['fact-1', snap('fact-1')],
  ['fact-2', snap('fact-2')],
  ['fact-3', snap('fact-3')],
])

describe('isReproposal (FR-007, research R6)', () => {
  it('is the same words (60%) or the same supporting facts as a rejected insight', () => {
    const rejected = [
      { statement: bi('Teams rebuild the reports they cannot find'), support: ['fact-9'] },
    ]
    expect(
      isReproposal(
        { statement: bi('Teams rebuild reports they cannot find'), support: ['x'] },
        rejected,
      ),
    ).toBe(true)
    expect(
      isReproposal({ statement: bi('Search works well'), support: ['fact-9'] }, rejected),
    ).toBe(true)
    expect(isReproposal({ statement: bi('Search works well'), support: ['x'] }, rejected)).toBe(
      false,
    )
  })
})

describe('mergeInsights (FR-006, research R5)', () => {
  const run = {
    runId: 'r1',
    at,
    snapshots,
    newId: (() => {
      let n = 0
      return () => `new-${++n}`
    })(),
  }
  const base = checkInsights([answer()], refs, themes, [], participants).kept[0]
  if (!base) throw new Error('the answer is kept')
  const checked = (over: Partial<typeof base> = {}) => ({ ...base, ...over })

  it('adds a new insight as proposed with its AI links counted', () => {
    const { creates } = mergeInsights([], [checked()], 'pr', run)
    expect(creates[0]).toMatchObject({ id: 'new-1', status: 'proposed', origin: 'ai', runId: 'r1' })
    expect(creates[0]?.links.map((l) => [l.factId, l.role, l.state])).toEqual([
      ['fact-1', 'support', 'counted'],
      ['fact-2', 'support', 'counted'],
    ])
  })

  it("replaces the texts and AI links of an insight still proposed, keeping a person's links", () => {
    const person = {
      factId: 'fact-3',
      role: 'counter' as const,
      state: 'counted' as const,
      origin: 'person' as const,
      snapshot: snap('fact-3'),
      by: 'p1',
      at,
    }
    const ai = {
      ...person,
      factId: 'fact-2',
      role: 'support' as const,
      origin: 'ai' as const,
      by: 'ai',
    }
    const existing = insight({ links: [person, ai] })
    const { updates } = mergeInsights(
      [existing],
      [checked({ ref: 'i-1', statement: bi('New words'), support: ['fact-1'] })],
      'pr',
      run,
    )
    expect(updates[0]?.statement.en).toBe('New words')
    expect(updates[0]?.version).toBe(2)
    expect(updates[0]?.links.map((l) => l.factId).sort()).toEqual(['fact-1', 'fact-3'])
  })

  it('never changes the texts of a decided insight; new facts come as suggested', () => {
    const decided = insight({
      status: 'validated',
      links: [
        {
          factId: 'fact-1',
          role: 'support',
          state: 'counted',
          origin: 'ai',
          snapshot: snap('fact-1'),
          by: 'ai',
          at,
        },
      ],
    })
    const { updates } = mergeInsights(
      [decided],
      [checked({ ref: 'i-1', statement: bi('Other words'), support: ['fact-1', 'fact-2'] })],
      'pr',
      run,
    )
    expect(updates[0]?.statement.en).toBe('Teams rebuild reports they cannot find')
    expect(updates[0]?.links.map((l) => [l.factId, l.state])).toEqual([
      ['fact-1', 'counted'],
      ['fact-2', 'suggested'],
    ])
  })

  it('leaves a rejected insight and a fact a person unlinked alone', () => {
    const unlinked = insight({
      status: 'edited',
      links: [
        {
          factId: 'fact-2',
          role: 'support',
          state: 'unlinked',
          origin: 'person',
          snapshot: snap('fact-2'),
          by: 'p1',
          at,
        },
      ],
    })
    const rejected = insight({ id: 'i-2', status: 'rejected' })
    const { updates } = mergeInsights(
      [unlinked, rejected],
      [checked({ ref: 'i-1' }), checked({ ref: 'i-2' })],
      'pr',
      run,
    )
    expect(updates.map((u) => u.id)).toEqual(['i-1'])
    expect(updates[0]?.links.find((l) => l.factId === 'fact-2')?.state).toBe('unlinked')
  })

  it('drops an update of an unknown insight, a reproposal and a repeat within the run', () => {
    const rejected = insight({
      id: 'i-9',
      status: 'rejected',
      statement: bi('Search works well for them'),
    })
    const { creates, updates, leftOut } = mergeInsights(
      [rejected],
      [
        checked({ ref: 'i-404' }),
        checked({ statement: bi('Search works well for them') }),
        checked(),
        checked({ statement: bi('Teams rebuild reports they cannot find again') }),
      ],
      'pr',
      run,
    )
    expect(updates).toEqual([])
    expect(creates).toHaveLength(1)
    expect(leftOut).toBe(3)
  })
})
