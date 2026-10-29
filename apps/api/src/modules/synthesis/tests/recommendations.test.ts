import { describe, expect, it } from 'vitest'
import type { InsightStatus } from '../domain/insights.ts'
import {
  checkRecommendations,
  createRecommendation,
  decideRecommendation,
  editRecommendation,
  type InsightNow,
  insightsChanged,
  isRecommendationReproposal,
  kindShown,
  linkInsight,
  linkStateOf,
  markRecommendationReviewed,
  mergeRecommendations,
  priority,
  type RecLink,
  type Recommendation,
  type RecommendationAnswer,
  unlinkInsight,
} from '../domain/recommendations.ts'
import { type Basis, checkDraft, outOfDate, savedOverOf, toValidate } from '../domain/takeaways.ts'

const at = new Date('2026-10-29T10:00:00Z')
const bi = (en: string, fr = en) => ({ en, fr })
const insight = (id: string, over: Partial<InsightNow> = {}): InsightNow => ({
  id,
  status: 'validated',
  statementEn: `Insight ${id}`,
  themeKey: 'finding data',
  level: 'high',
  version: 2,
  ...over,
})
const insights = new Map([
  ['i-a', insight('i-a')],
  ['i-b', insight('i-b', { level: 'low' })],
  ['i-p', insight('i-p', { status: 'proposed' })],
  ['i-r', insight('i-r', { status: 'rejected' })],
])
const snap = (id: string) => {
  const i = insights.get(id)
  return { statementEn: i?.statementEn ?? '', themeKey: 'finding data', level: i?.level ?? 'high' }
}
const link = (insightId: string, over: Partial<RecLink> = {}): RecLink => ({
  insightId,
  state: 'counted',
  origin: 'ai',
  snapshot: snap(insightId),
  by: 'ai',
  at,
  ...over,
})
const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  id: 'r1',
  projectId: 'pr',
  action: bi('Add a shared catalogue of reports'),
  rationale: bi('Teams rebuild what exists.'),
  successMeasure: bi('Fewer duplicated reports'),
  kind: 'build',
  impact: 'high',
  effort: 'medium',
  owner: null,
  translation: 'done',
  origin: 'ai',
  status: 'proposed',
  runId: 'run0',
  decidedBy: null,
  decidedAt: null,
  version: 1,
  links: [link('i-a')],
  ...over,
})
const answer = (over: Partial<RecommendationAnswer> = {}): RecommendationAnswer => ({
  action: bi('Add a shared catalogue of reports', 'Ajouter un catalogue partagé'),
  rationale: bi('Teams rebuild what exists.'),
  kind: 'build',
  impact: 'high',
  effort: 'medium',
  successMeasure: bi('Fewer duplicated reports'),
  insights: ['i1'],
  ...over,
})
const refs = new Map([
  ['i1', 'i-a'],
  ['i2', 'i-b'],
])
const ctx = { insights, names: ['Sam Example'], by: 'p1', at }

describe('computed values (FR-006, research R4)', () => {
  it('priority is impact × 2 − effort', () => {
    expect(priority('high', 'low')).toBe(5)
    expect(priority('medium', 'medium')).toBe(2)
    expect(priority('low', 'high')).toBe(-1)
  })

  it('a build resting only on low-confidence insights is shown as a test', () => {
    expect(kindShown(rec({ links: [link('i-b')] }), insights)).toEqual({
      kind: 'test',
      downgraded: true,
    })
    expect(kindShown(rec({ links: [link('i-a'), link('i-b')] }), insights)).toEqual({
      kind: 'build',
      downgraded: false,
    })
    expect(kindShown(rec({ kind: 'investigate', links: [link('i-b')] }), insights).kind).toBe(
      'investigate',
    )
  })

  it('tells each linked insight now, and what changed since', () => {
    expect(linkStateOf(link('i-a'), insights.get('i-a'))).toBe('validated')
    expect(linkStateOf(link('i-p'), insights.get('i-p'))).toBe('to-decide')
    expect(linkStateOf(link('i-r'), insights.get('i-r'))).toBe('rejected')
    expect(linkStateOf(link('gone'), undefined)).toBe('deleted')
    expect(linkStateOf(link('i-a'), insight('i-a', { level: 'low' }))).toBe('changed')
    const r = rec({ links: [link('i-a'), link('i-p'), link('i-r')] })
    expect(insightsChanged(r.links, insights)).toBe(1)
  })
})

describe('checkRecommendations (FR-004)', () => {
  it('keeps known insights only and drops a recommendation without one', () => {
    const { kept, leftOut } = checkRecommendations(
      [answer({ insights: ['i1', 'i9'] }), answer({ insights: ['i9'] })],
      refs,
      [],
    )
    expect(kept.map((k) => k.insights)).toEqual([['i-a']])
    expect(leftOut).toBe(1)
  })

  it('drops values outside the lists, names in the action and texts too long', () => {
    const { kept, leftOut } = checkRecommendations(
      [
        answer({ kind: 'launch' as 'build' }),
        answer({ impact: 'huge' as 'high' }),
        answer({ action: bi('Ask Sam to share reports') }),
        answer({ action: bi('x'.repeat(201)) }),
      ],
      refs,
      ['Sam Example'],
    )
    expect(kept).toEqual([])
    expect(leftOut).toBe(4)
  })

  it('keeps at most 15 new recommendations', () => {
    const many = Array.from({ length: 18 }, (_, n) =>
      answer({ action: bi(`Distinct action ${n}`) }),
    )
    const { kept, leftOut } = checkRecommendations(many, refs, [])
    expect(kept).toHaveLength(15)
    expect(leftOut).toBe(3)
  })
})

describe('mergeRecommendations (FR-005)', () => {
  const run = {
    runId: 'run1',
    at,
    insights,
    newId: (() => {
      let n = 0
      return () => `new-${++n}`
    })(),
  }
  const checked = (over = {}) => {
    const [k] = checkRecommendations([answer(over)], refs, []).kept
    if (!k) throw new Error('kept')
    return k
  }

  it('adds new ones as proposed, never a reproposal of a rejected one', () => {
    const rejected = rec({
      id: 'r9',
      status: 'rejected',
      action: bi('Train the teams on search'),
      links: [link('i-b')],
    })
    const { creates, leftOut } = mergeRecommendations(
      [rejected],
      [checked(), checked({ action: bi('Train the teams on search tools') })],
      'pr',
      run,
    )
    expect(creates.map((c) => [c.status, c.links.map((l) => l.insightId)])).toEqual([
      ['proposed', ['i-a']],
    ])
    expect(leftOut).toBe(1)
  })

  it('never changes a decided one: new insights come as suggested', () => {
    const decided = rec({ status: 'validated' })
    const { updates } = mergeRecommendations(
      [decided],
      [checked({ ref: 'r1', action: bi('Other words'), insights: ['i1', 'i2'] })],
      'pr',
      run,
    )
    expect(updates[0]?.action.en).toBe('Add a shared catalogue of reports')
    expect(updates[0]?.links.map((l) => [l.insightId, l.state])).toEqual([
      ['i-a', 'counted'],
      ['i-b', 'suggested'],
    ])
  })

  it('never rewrites one a person edited, even still proposed (review of PR #14)', () => {
    const edited = rec({ decidedBy: 'p1', decidedAt: at, action: bi('My own words') })
    const { updates } = mergeRecommendations(
      [edited],
      [checked({ ref: 'r1', action: bi('AI words'), insights: ['i1', 'i2'] })],
      'pr',
      run,
    )
    expect(updates[0]?.action.en).toBe('My own words')
    expect(updates[0]?.links.find((l) => l.insightId === 'i-b')?.state).toBe('suggested')
  })

  it('reproposal: 60% of the words or the same insights of a rejected one', () => {
    const r = [{ action: bi('Add a catalogue of the team reports'), insights: ['i-z'] }]
    expect(
      isRecommendationReproposal({ action: bi('Add a catalogue of reports'), insights: ['x'] }, r),
    ).toBe(true)
    expect(isRecommendationReproposal({ action: bi('Run a survey'), insights: ['i-z'] }, r)).toBe(
      true,
    )
    expect(isRecommendationReproposal({ action: bi('Run a survey'), insights: ['x'] }, r)).toBe(
      false,
    )
  })
})

describe('decisions (FR-007)', () => {
  it('validates with a counted validated insight only', () => {
    expect(decideRecommendation(rec(), 'validate', ctx)).toMatchObject({ ok: true })
    expect(decideRecommendation(rec({ links: [link('i-p')] }), 'validate', ctx)).toEqual({
      ok: false,
      error: 'RECOMMENDATION_NEEDS_INSIGHT',
    })
  })

  it('edits in place into "edited", reviewing its insights; refuses a name in the action', () => {
    const changedNow = new Map([...insights, ['i-a', insight('i-a', { level: 'low' })]])
    const e = editRecommendation(
      rec(),
      { effort: 'low', owner: 'Data team' },
      { ...ctx, insights: changedNow },
    )
    expect(e.ok && e.value).toMatchObject({
      status: 'edited',
      effort: 'low',
      owner: 'Data team',
      version: 2,
    })
    expect(e.ok && e.value.links[0]?.snapshot.level).toBe('low')
    expect(editRecommendation(rec(), { action: bi('Ask Sam') }, ctx)).toEqual({
      ok: false,
      error: 'NAME_IN_STATEMENT',
    })
  })

  it('an edit makes it "edited" only when it rests on a validated insight; else it stays proposed', () => {
    const toDecide = rec({ links: [link('i-p')] })
    const moved = editRecommendation(toDecide, { effort: 'low' }, ctx)
    expect(moved.ok && moved.value).toMatchObject({ status: 'proposed', effort: 'low', version: 2 })
    const supported = editRecommendation(rec(), { effort: 'low' }, ctx)
    expect(supported.ok && supported.value.status).toBe('edited')
  })

  it('creates one by hand, validated, links and unlinks insights', () => {
    const c = createRecommendation(
      {
        id: 'n1',
        projectId: 'pr',
        action: bi('Run a survey'),
        kind: 'investigate',
        impact: 'medium',
        effort: 'low',
        insights: ['i-a', 'i-p'],
      },
      ctx,
    )
    expect(c.ok && c.value).toMatchObject({ status: 'validated', origin: 'person' })
    expect(
      createRecommendation(
        {
          id: 'n2',
          projectId: 'pr',
          action: bi('x'),
          kind: 'test',
          impact: 'low',
          effort: 'low',
          insights: ['i-r'],
        },
        ctx,
      ),
    ).toEqual({
      ok: false,
      error: 'INSIGHT_NOT_VALIDATED',
    })
    const l = linkInsight(rec(), 'i-b', ctx)
    expect(l.ok && l.value.links.map((x) => x.insightId)).toEqual(['i-a', 'i-b'])
    const u = unlinkInsight(
      rec({ status: 'validated', links: [link('i-a'), link('i-b')] }),
      'i-a',
      ctx,
    )
    expect(u.ok && u.value.links[0]?.state).toBe('unlinked')
    expect(unlinkInsight(rec({ status: 'validated' }), 'i-a', ctx)).toEqual({
      ok: false,
      error: 'RECOMMENDATION_NEEDS_INSIGHT',
    })
    // "Reviewed" lets go of an insight rejected or deleted: it no longer flags the recommendation.
    const gone = rec({ status: 'validated', links: [link('i-a'), link('i-r'), link('x-deleted')] })
    const seen = markRecommendationReviewed(gone, ctx)
    expect(seen.ok && insightsChanged(seen.value.links, insights)).toBe(0)
    expect(seen.ok && seen.value.links.map((l) => l.state)).toEqual([
      'counted',
      'unlinked',
      'unlinked',
    ])
    // A decided one is never left without a validated insight: the flag stays, the person decides.
    const alone = markRecommendationReviewed(
      rec({ status: 'validated', links: [link('i-r')] }),
      ctx,
    )
    expect(alone.ok && alone.value.links[0]?.state).toBe('counted')
    const reviewed = markRecommendationReviewed(rec(), {
      ...ctx,
      insights: new Map([['i-a', insight('i-a', { statementEn: 'New' })]]),
    })
    expect(reviewed.ok && reviewed.value.links[0]?.snapshot.statementEn).toBe('New')
  })
})

describe('key takeaways (FR-010, research R5)', () => {
  it('keeps 2 to 4 sentences without a percentage or a name', () => {
    const d = checkDraft(
      [
        bi('Teams lose time.'),
        bi('About 40% rebuild reports.'),
        bi('Sam is lost.'),
        bi('A catalogue helps.'),
      ],
      ['Sam Example'],
    )
    expect(d).toEqual({
      en: 'Teams lose time. A catalogue helps.',
      fr: 'Teams lose time. A catalogue helps.',
    })
    expect(checkDraft([bi('Only one.')], [])).toBeNull()
    const five = Array.from({ length: 5 }, (_, n) => bi(`Sentence ${n}.`))
    expect(checkDraft(five, [])?.en.split('. ').length).toBe(4)
  })

  const at1 = new Date('2026-10-29T10:00:00Z')
  const at2 = new Date('2026-10-29T11:00:00Z')
  const item = (id: string, status: InsightStatus, over: Partial<Basis> = {}): Basis => ({
    id,
    status,
    decidedAt: status === 'proposed' ? null : at1,
    runId: 'run1',
    ...over,
  })

  it('tells when what the takeaways rest on changed in meaning since saved', () => {
    const insights = [item('i1', 'validated', { level: 'high' }), item('i2', 'proposed')]
    const recs = [item('r1', 'edited')]
    const over = savedOverOf(insights, recs)
    expect(over.map((x) => x.split(':')[0])).toEqual(['i1', 'r1'])
    expect(outOfDate(over, savedOverOf(insights, recs))).toBe(false)
    // A decision, a person's edit, a new level of confidence: out of date.
    expect(outOfDate(over, savedOverOf(insights, [item('r1', 'edited', { decidedAt: at2 })]))).toBe(
      true,
    )
    expect(outOfDate(over, savedOverOf([item('i1', 'validated', { level: 'low' })], recs))).toBe(
      true,
    )
    expect(outOfDate(null, over)).toBe(false)
  })

  it('a translation, a review or a suggested link (no change of meaning) is no change', () => {
    // These raise the version only: the basis does not hold it.
    const before = savedOverOf(
      [item('i1', 'validated', { level: 'high' })],
      [item('r1', 'validated')],
    )
    const after = savedOverOf(
      [item('i1', 'validated', { level: 'high' })],
      [item('r1', 'validated')],
    )
    expect(outOfDate(before, after)).toBe(false)
  })

  it('may rest on what is still to decide, and tells how much of it is not validated yet', () => {
    const insights = [item('i1', 'validated'), item('i2', 'proposed'), item('i3', 'rejected')]
    const recs = [item('r1', 'proposed')]
    const over = savedOverOf(insights, recs, true)
    expect(over.map((x) => x.split(':')[0])).toEqual(['i1', 'i2', 'r1'])
    expect(toValidate(over, [...insights, ...recs])).toBe(2)
    expect(toValidate(over, [item('i2', 'validated'), ...recs])).toBe(1)
  })
})
