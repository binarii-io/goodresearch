import { describe, expect, it } from 'vitest'
import { confidence, panelOf, polarity } from '../domain/confidence.ts'
import type { FactNow, Link } from '../domain/insights.ts'
import { evidenceChanged, linkState } from '../domain/links.ts'

const at = new Date('2026-10-29T10:00:00Z')
const fact = (
  id: string,
  participant: string,
  polarity: FactNow['polarity'] = 'negative',
  status: FactNow['status'] = 'accepted',
  studyId = 'st',
): FactNow => ({
  id,
  studyId,
  status,
  participants: [participant],
  polarity,
  theme: { id: 't1', title: 'Finding data' },
  statement: { en: `Fact ${id}`, fr: `Fait ${id}` },
  version: 1,
})
const link = (factId: string, role: Link['role'] = 'support', state: Link['state'] = 'counted') =>
  ({
    factId,
    role,
    state,
    origin: 'ai',
    snapshot: { version: 1, polarity: 'negative', themeId: 't1', statementEn: `Fact ${factId}` },
    by: 'ai',
    at,
  }) satisfies Link

const facts = (n: number, p: FactNow['polarity'] = 'negative') =>
  Array.from({ length: n }, (_, i) => fact(`f${i + 1}`, `P0${i + 1}`, p))
const byId = (list: FactNow[]) => new Map(list.map((f) => [f.id, f]))
const studies = new Set(['st'])

describe('panel (FR-008)', () => {
  it('counts the participants with accepted facts in the project, study by study', () => {
    const list = [
      fact('a', 'P01'),
      fact('b', 'P01'),
      fact('c', 'P02', 'neutral', 'proposed'),
      fact('d', 'P01', 'neutral', 'accepted', 'st2'),
    ]
    expect(panelOf(list, new Set(['st', 'st2']))).toBe(2)
  })
  it('counts the participants of facts still to decide too, for the panel once validated', () => {
    const list = [
      fact('a', 'P01'),
      fact('c', 'P02', 'neutral', 'proposed'),
      fact('r', 'P03', 'neutral', 'rejected'),
    ]
    expect(panelOf(list, studies, true)).toBe(2)
  })
})

describe('confidence (FR-008, research R4)', () => {
  it('is high from max(5, 30% of the panel) supporting participants', () => {
    const list = facts(6)
    const c = confidence(
      list.slice(0, 5).map((f) => link(f.id)),
      byId(list),
      studies,
      6,
    )
    expect(c).toMatchObject({ level: 'high', support: 5, counter: 0, highAt: 5, missingForHigh: 0 })
  })

  it('needs 30% of a large panel', () => {
    const list = facts(5)
    const c = confidence(
      list.map((f) => link(f.id)),
      byId(list),
      studies,
      20,
    )
    expect(c).toMatchObject({ level: 'medium', highAt: 6, missingForHigh: 1 })
  })

  it('is medium from 3, low below', () => {
    const list = facts(3)
    expect(
      confidence(
        list.map((f) => link(f.id)),
        byId(list),
        studies,
        10,
      ).level,
    ).toBe('medium')
    expect(
      confidence(
        list.slice(0, 2).map((f) => link(f.id)),
        byId(list),
        studies,
        10,
      ),
    ).toMatchObject({ level: 'low', missingForHigh: 3 })
  })

  it('counts a participant once, whatever their number of facts', () => {
    const list = [fact('a', 'P01'), fact('b', 'P01'), fact('c', 'P01')]
    expect(
      confidence(
        list.map((f) => link(f.id)),
        byId(list),
        studies,
        3,
      ),
    ).toMatchObject({
      level: 'low',
      support: 1,
    })
  })

  it('goes one level down when counter-evidence comes from half as many participants', () => {
    const list = [...facts(6), fact('x1', 'P07', 'positive'), fact('x2', 'P08', 'positive')]
    const links = [
      ...list.slice(0, 6).map((f) => link(f.id)),
      link('x1', 'counter'),
      link('x2', 'counter'),
    ]
    expect(confidence(links, byId(list), studies, 8).level).toBe('high')
    const more = [...list, fact('x3', 'P09', 'positive')]
    const c = confidence([...links, link('x3', 'counter')], byId(more), studies, 9)
    expect(c).toMatchObject({ level: 'medium', counter: 3, lowered: true })
  })

  it('tells what the facts still to decide would add once accepted', () => {
    const list = [
      fact('a', 'P01'),
      ...['P02', 'P03', 'P04', 'P05'].map((p, i) => fact(`p${i}`, p, 'negative', 'proposed')),
      fact('x', 'P06', 'positive', 'proposed'),
    ]
    const links = [link('a'), ...[0, 1, 2, 3].map((i) => link(`p${i}`)), link('x', 'counter')]
    expect(confidence(links, byId(list), studies, 6)).toMatchObject({
      level: 'low',
      support: 1,
      pendingSupport: 4,
      pendingCounter: 1,
      levelIfAccepted: 'high',
      panelIfAccepted: 6,
    })
    // Once validated, the panel grows too: 5 of 20 is not high.
    expect(confidence(links, byId(list), studies, 6, 20)).toMatchObject({
      levelIfAccepted: 'medium',
      panelIfAccepted: 20,
    })
  })

  it('counts only counted links to accepted facts of the project', () => {
    const list = [
      fact('a', 'P01'),
      fact('b', 'P02', 'negative', 'rejected'),
      fact('c', 'P03', 'negative', 'accepted', 'elsewhere'),
      fact('d', 'P04'),
      fact('e', 'P05'),
    ]
    const links = [
      link('a'),
      link('b'),
      link('c'),
      link('d', 'support', 'suggested'),
      link('e', 'support', 'unlinked'),
      link('gone'),
    ]
    expect(confidence(links, byId(list), studies, 5).support).toBe(1)
  })
})

describe('polarity (FR-009)', () => {
  const mixed = (pos: number, neg: number, neu: number) => [
    ...Array.from({ length: pos }, (_, i) => fact(`p${i}`, `A${i}`, 'positive')),
    ...Array.from({ length: neg }, (_, i) => fact(`n${i}`, `B${i}`, 'negative')),
    ...Array.from({ length: neu }, (_, i) => fact(`z${i}`, `C${i}`, 'neutral')),
  ]
  const of = (list: FactNow[]) =>
    polarity(
      list.map((f) => link(f.id)),
      byId(list),
      studies,
    )

  it('is neutral when fewer than 30% of the facts are polarised', () => {
    expect(of(mixed(1, 1, 5))).toBe('neutral')
  })
  it('is one side when it holds 60% of the polarised facts', () => {
    expect(of(mixed(1, 3, 2))).toBe('negative')
    expect(of(mixed(3, 2, 0))).toBe('positive')
  })
  it('is mixed otherwise', () => {
    expect(of(mixed(2, 2, 1))).toBe('mixed')
  })
  it('is neutral without supporting facts; counter facts do not count', () => {
    const list = [fact('a', 'P01', 'positive')]
    expect(polarity([link('a', 'counter')], byId(list), studies)).toBe('neutral')
  })
})

describe('linkState (research R7)', () => {
  it('tells a deleted, outside, no longer accepted or changed fact', () => {
    const l = link('a')
    expect(linkState(l, undefined, studies)).toBe('deleted')
    expect(linkState(l, fact('a', 'P01', 'negative', 'accepted', 'gone'), studies)).toBe('outside')
    expect(linkState(l, fact('a', 'P01', 'negative', 'rejected'), studies)).toBe('not-accepted')
    expect(linkState(l, { ...fact('a', 'P01', 'positive'), version: 2 }, studies)).toBe('changed')
    expect(linkState(l, fact('a', 'P01'), studies)).toBe('accepted')
  })
  it('tells a fact still to decide: shown, never counted, not a change', () => {
    const l = link('a')
    const proposed = fact('a', 'P01', 'negative', 'proposed')
    expect(linkState(l, proposed, studies)).toBe('to-decide')
    expect(confidence([l], new Map([['a', proposed]]), studies, 1).support).toBe(0)
    expect(evidenceChanged([l], new Map([['a', proposed]]), studies)).toBe(0)
    expect(
      evidenceChanged([l], new Map([['a', { ...proposed, status: 'rejected' }]]), studies),
    ).toBe(1)
  })
  it('is not changed when only the version moved (a decision kept its words)', () => {
    expect(linkState(link('a'), { ...fact('a', 'P01'), version: 3 }, studies)).toBe('accepted')
  })
})
