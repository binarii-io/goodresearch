import { describe, expect, it } from 'vitest'
import {
  createInsight,
  decide,
  editInsight,
  linkFact,
  markReviewed,
  unlinkFact,
} from '../domain/decisions.ts'
import type { FactNow, Insight, Link } from '../domain/insights.ts'

const at = new Date('2026-10-29T10:00:00Z')
const bi = (en: string, fr = en) => ({ en, fr })
const studies = new Set(['st'])
const fact = (id: string, over: Partial<FactNow> = {}): FactNow => ({
  id,
  studyId: 'st',
  status: 'accepted',
  participants: ['P01'],
  polarity: 'negative',
  theme: { id: 't1', title: 'Finding data' },
  statement: bi(`Fact ${id}`),
  version: 1,
  ...over,
})
const facts = new Map([
  ['a', fact('a')],
  ['b', fact('b')],
  ['r', fact('r', { status: 'rejected' })],
  ['p', fact('p', { status: 'proposed' })],
  ['x', fact('x', { studyId: 'elsewhere' })],
])
const link = (factId: string, over: Partial<Link> = {}): Link => ({
  factId,
  role: 'support',
  state: 'counted',
  origin: 'ai',
  snapshot: { version: 1, polarity: 'negative', themeId: 't1', statementEn: `Fact ${factId}` },
  by: 'ai',
  at,
  ...over,
})
const insight = (over: Partial<Insight> = {}): Insight => ({
  id: 'i1',
  projectId: 'pr',
  theme: { key: 'finding data', title: 'Finding data' },
  statement: bi('Teams rebuild reports'),
  description: bi(''),
  counterEvidence: bi('None'),
  minorityView: bi('None'),
  translation: 'done',
  origin: 'ai',
  status: 'proposed',
  runId: 'r1',
  decidedBy: null,
  decidedAt: null,
  version: 3,
  links: [link('a')],
  ...over,
})
const ctx = { facts, studies, names: ['Sam Example'], by: 'p1', at }

describe('Insight decisions (FR-010, data-model invariants)', () => {
  it('validates or rejects with who and when, and a new version', () => {
    const v = decide(insight(), 'validate', ctx)
    expect(v.ok && v.value).toMatchObject({ status: 'validated', decidedBy: 'p1', version: 4 })
    const r = decide(insight({ links: [] }), 'reject', ctx)
    expect(r.ok && r.value.status).toBe('rejected')
  })

  it('refuses to validate without a counted support to an accepted fact of the project', () => {
    for (const links of [[], [link('r')], [link('x')], [link('a', { state: 'suggested' })]])
      expect(decide(insight({ links }), 'validate', ctx)).toEqual({
        ok: false,
        error: 'INSIGHT_NEEDS_SUPPORT',
      })
  })

  it('edits into "edited", refusing a name, and refreshes the facts as reviewed', () => {
    const changed = new Map([...facts, ['a', fact('a', { version: 2, polarity: 'positive' })]])
    const e = editInsight(
      insight(),
      { statement: bi('Reports are rebuilt') },
      { ...ctx, facts: changed },
    )
    expect(e.ok && e.value).toMatchObject({
      status: 'edited',
      statement: bi('Reports are rebuilt'),
    })
    expect(e.ok && e.value.links[0]?.snapshot.polarity).toBe('positive')
    expect(editInsight(insight(), { statement: bi('Sam rebuilds reports') }, ctx)).toEqual({
      ok: false,
      error: 'NAME_IN_STATEMENT',
    })
  })

  it('creates a person insight, validated, needing a supporting fact', () => {
    const c = createInsight(
      {
        id: 'n1',
        projectId: 'pr',
        theme: { key: 'other', title: null },
        statement: bi('Search is slow'),
        support: ['a'],
        counter: ['b'],
      },
      ctx,
    )
    expect(c.ok && c.value).toMatchObject({ status: 'validated', origin: 'person', version: 1 })
    expect(c.ok && c.value.links.map((l) => [l.factId, l.role, l.origin])).toEqual([
      ['a', 'support', 'person'],
      ['b', 'counter', 'person'],
    ])
    expect(
      createInsight(
        {
          id: 'n2',
          projectId: 'pr',
          theme: { key: 'other', title: null },
          statement: bi('S'),
          support: ['r'],
          counter: [],
        },
        ctx,
      ),
    ).toEqual({ ok: false, error: 'FACT_NOT_ACCEPTED' })
  })

  it('links a fact with one role, accepts a suggested one, and refuses a fact not accepted', () => {
    const withB = linkFact(insight(), 'b', 'counter', ctx)
    expect(withB.ok && withB.value.links.map((l) => [l.factId, l.role])).toEqual([
      ['a', 'support'],
      ['b', 'counter'],
    ])
    const moved = linkFact(insight(), 'a', 'counter', ctx)
    expect(moved.ok && moved.value.links).toEqual([
      expect.objectContaining({ factId: 'a', role: 'counter', state: 'counted', origin: 'person' }),
    ])
    const suggested = insight({ links: [link('a'), link('b', { state: 'suggested' })] })
    const accepted = linkFact(suggested, 'b', 'support', ctx)
    expect(accepted.ok && accepted.value.links[1]?.state).toBe('counted')
    expect(linkFact(insight(), 'r', 'support', ctx)).toEqual({
      ok: false,
      error: 'FACT_NOT_ACCEPTED',
    })
    expect(linkFact(insight(), 'x', 'support', ctx)).toEqual({
      ok: false,
      error: 'FACT_NOT_ACCEPTED',
    })
  })

  it('links a fact still to decide, which counts only once accepted', () => {
    const l = linkFact(insight({ links: [] }), 'p', 'support', ctx)
    expect(l.ok && l.value.links[0]).toMatchObject({ factId: 'p', state: 'counted' })
    if (!l.ok) return
    expect(decide(l.value, 'validate', ctx)).toEqual({ ok: false, error: 'INSIGHT_NEEDS_SUPPORT' })
  })

  it('unlinks a fact (kept as "unlinked" so no run brings it back)', () => {
    const two = insight({ links: [link('a'), link('b')] })
    const u = unlinkFact(two, 'b', ctx)
    expect(u.ok && u.value.links[1]).toMatchObject({ factId: 'b', state: 'unlinked', by: 'p1' })
  })

  it('refuses to leave a decided insight without support', () => {
    expect(unlinkFact(insight({ status: 'validated' }), 'a', ctx)).toEqual({
      ok: false,
      error: 'INSIGHT_NEEDS_SUPPORT',
    })
    expect(unlinkFact(insight(), 'a', ctx).ok).toBe(true)
  })

  it('"Reviewed" lets go of facts no longer accepted or deleted', () => {
    const r = markReviewed(
      insight({ status: 'validated', links: [link('a'), link('r'), link('x'), link('gone')] }),
      ctx,
    )
    expect(r.ok && r.value.links.map((l) => [l.factId, l.state])).toEqual([
      ['a', 'counted'],
      ['r', 'unlinked'],
      ['x', 'counted'],
      ['gone', 'unlinked'],
    ])
  })

  it('"Reviewed" never leaves a decided insight without support, nor lets go of a study away', () => {
    const alone = markReviewed(insight({ status: 'validated', links: [link('r')] }), ctx)
    expect(alone.ok && alone.value.links[0]?.state).toBe('counted')
    const away = markReviewed(insight({ status: 'validated', links: [link('a'), link('x')] }), ctx)
    expect(away.ok && away.value.links.map((l) => l.state)).toEqual(['counted', 'counted'])
  })

  it('marks the facts reviewed: snapshots taken again, nothing else changed', () => {
    const changed = new Map([
      ...facts,
      ['a', fact('a', { version: 5, statement: bi('New words') })],
    ])
    const r = markReviewed(insight({ status: 'validated' }), { ...ctx, facts: changed })
    expect(r.ok && r.value).toMatchObject({ status: 'validated', version: 4 })
    expect(r.ok && r.value.links[0]?.snapshot).toEqual({
      version: 5,
      polarity: 'negative',
      themeId: 't1',
      statementEn: 'New words',
    })
  })
})
