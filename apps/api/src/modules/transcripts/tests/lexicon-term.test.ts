import { findMatches } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import type { CheckedTerm } from '../domain/answer-check.ts'
import type { Interview } from '../domain/candidates.ts'
import {
  absorb,
  countedSpellings,
  decideTerm,
  defaultScope,
  type LexiconTerm,
  mergeTerms,
  proposeTerm,
  spellingsOf,
  toDecide,
} from '../domain/lexicon-term.ts'
import { ANCHORS_KEPT, countOccurrences, occurrenceAt } from '../domain/occurrences.ts'

const NOW = new Date('2026-10-26T10:00:00Z')
const LATER = new Date('2026-10-26T11:00:00Z')

const checked = (over: Partial<CheckedTerm> = {}): CheckedTerm => ({
  form: 'Goodresearch',
  kind: 'domain',
  correction: null,
  category: 'product',
  definition: 'The research app.',
  variants: ['Gooresearch', 'good research', 'Goodresearch'],
  existingForm: null,
  quote: 'we use Gooresearch',
  ...over,
})

const term = (over: Partial<CheckedTerm> = {}, id = 't1') =>
  proposeTerm(checked(over), { id, teamId: 'team', language: 'en', now: NOW })

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('proposeTerm', () => {
  it('is proposed, its other spellings proposed variants', () => {
    const t = term()
    expect(t.status).toBe('proposed')
    expect(t.variants.map((v) => [v.spelling, v.status])).toEqual([
      ['Gooresearch', 'proposed'],
      ['good research', 'proposed'],
    ])
    expect(toDecide(t)).toBe(true)
  })
})

describe('decideTerm', () => {
  it('accepting takes the proposed variants unless decided one by one', () => {
    const t = value(
      decideTerm(
        term(),
        { decision: 'accept', variants: [{ spelling: 'GOOD RESEARCH', status: 'rejected' }] },
        'p1',
        LATER,
      ),
    )
    expect(t.status).toBe('accepted')
    expect(t.variants.map((v) => v.status)).toEqual(['accepted', 'rejected'])
    expect([t.decidedBy, t.version]).toEqual(['p1', 2])
    expect(toDecide(t)).toBe(false)
  })

  it('needs a correction for a suspect term', () => {
    expect(decideTerm(term({ kind: 'suspect' }), { decision: 'accept' }, 'p1', LATER)).toEqual({
      ok: false,
      error: 'CORRECTION_REQUIRED',
    })
    expect(
      decideTerm(
        term(),
        {
          decision: 'edit',
          fields: {
            form: 'meating',
            kind: 'suspect',
            correction: null,
            category: 'other',
            definition: null,
          },
        },
        'p1',
        LATER,
      ),
    ).toEqual({ ok: false, error: 'CORRECTION_REQUIRED' })
  })

  it('editing the form keeps the old one as a spelling', () => {
    const t = value(
      decideTerm(
        term(),
        {
          decision: 'edit',
          fields: {
            form: 'Gooresearch',
            kind: 'domain',
            correction: 'x',
            category: 'product',
            definition: ' ',
          },
        },
        'p1',
        LATER,
      ),
    )
    expect(t.form).toBe('Gooresearch')
    expect(t.status).toBe('edited')
    expect(t.correction).toBeNull()
    expect(t.definition).toBeNull()
    expect(t.variants.map((v) => v.spelling)).toEqual(['good research', 'Goodresearch'])
  })

  it('rejects, reopens, and refuses other transitions', () => {
    const rejected = value(decideTerm(term(), { decision: 'reject' }, 'p1', LATER))
    expect(rejected.status).toBe('rejected')
    expect(decideTerm(rejected, { decision: 'accept' }, 'p1', LATER).ok).toBe(false)
    expect(value(decideTerm(rejected, { decision: 'reopen' }, 'p1', LATER)).status).toBe('proposed')
    expect(decideTerm(term(), { decision: 'reopen' }, 'p1', LATER).ok).toBe(false)
  })
})

describe('mergeTerms', () => {
  it('moves the spellings and marks the other merged', () => {
    const into = term({ form: 'Acknowledgement', variants: [] }, 'a')
    const from = term({ form: 'Ack', variants: ['Akk'] }, 'b')
    const { from: f, into: i } = value(mergeTerms(from, into, 'p1', LATER))
    expect(f.status).toBe('merged')
    expect(f.mergedInto).toBe('a')
    expect(i.status).toBe('accepted')
    expect(i.variants.map((v) => [v.spelling, v.status])).toEqual([
      ['Ack', 'accepted'],
      ['Akk', 'accepted'],
    ])
    expect(spellingsOf(f)).toEqual([])
  })

  it('refuses itself and another language', () => {
    const a = term({}, 'a')
    expect(mergeTerms(a, a, 'p1', LATER)).toEqual({ ok: false, error: 'MERGE_ITSELF' })
    expect(mergeTerms(a, { ...term({}, 'b'), language: 'fr' }, 'p1', LATER)).toEqual({
      ok: false,
      error: 'LANGUAGE_DIFFERS',
    })
  })
})

describe('absorb (a new reading)', () => {
  it('only adds proposed variants to a decided term, never a rejected one again', () => {
    const accepted = value(
      decideTerm(
        term(),
        { decision: 'accept', variants: [{ spelling: 'good research', status: 'rejected' }] },
        'p1',
        LATER,
      ),
    )
    const next = absorb(
      accepted,
      checked({
        definition: 'Other',
        category: 'other',
        variants: ['good research', 'Goodreserch'],
      }),
      LATER,
    ) as LexiconTerm
    expect(next.definition).toBe('The research app.')
    expect(next.category).toBe('product')
    expect(next.variants.map((v) => [v.spelling, v.status])).toEqual([
      ['Gooresearch', 'accepted'],
      ['good research', 'rejected'],
      ['Goodreserch', 'proposed'],
    ])
    expect(toDecide(next)).toBe(true)
    expect(absorb(next, checked({ variants: ['Goodreserch'] }), LATER)).toBeNull()
  })

  it('refreshes a term still proposed', () => {
    expect(absorb(term(), checked({ definition: 'New' }), LATER)?.definition).toBe('New')
  })
})

describe('spellings', () => {
  it('a rejected term gives rejected spellings, still counted', () => {
    const rejected = value(decideTerm(term(), { decision: 'reject' }, 'p1', LATER))
    expect(spellingsOf(rejected).every((s) => s.state === 'rejected')).toBe(true)
    expect(countedSpellings(rejected)).toEqual(['Goodresearch', 'Gooresearch', 'good research'])
    const accepted = value(decideTerm(term(), { decision: 'accept' }, 'p1', LATER))
    expect(spellingsOf(accepted)[0]).toMatchObject({ spelling: 'Goodresearch', accepted: true })
  })
})

describe('countOccurrences', () => {
  const text = 'Goodresearch and good research; NPS, nps. Goodresearchers? goodresearch!'
  const interview: Interview = {
    sessionId: 's',
    language: 'en',
    segments: [{ id: 'g1', speaker: 'Lee', start: null, text }],
  }

  it('counts each spelling like the shared match rule', () => {
    const terms = [term(), term({ form: 'NPS', variants: [] }, 't2')]
    const rows = countOccurrences([interview], terms)
    for (const r of rows) expect(r.count).toBe(findMatches(text, r.spelling).length)
    expect(rows.map((r) => [r.termId, r.spelling, r.count])).toEqual([
      ['t1', 'Goodresearch', 2],
      ['t1', 'good research', 1],
      ['t2', 'NPS', 1],
    ])
    expect(rows[0]?.anchors).toEqual([
      { segmentId: 'g1', offset: 0, length: 12 },
      { segmentId: 'g1', offset: text.lastIndexOf('goodresearch'), length: 12 },
    ])
    expect(rows[1]?.anchors).toEqual([
      { segmentId: 'g1', offset: text.indexOf('good research'), length: 13 },
    ])
  })

  it('keeps 50 places per spelling and interview, counting them all', () => {
    const many: Interview = {
      ...interview,
      segments: [{ id: 'g2', speaker: 'Lee', start: null, text: 'NPS '.repeat(60) }],
    }
    const [row] = countOccurrences([many], [term({ form: 'NPS', variants: [] }, 't2')])
    expect(row?.count).toBe(60)
    expect(row?.anchors).toHaveLength(ANCHORS_KEPT)
  })

  it('counts only terms of the interview language', () => {
    expect(countOccurrences([{ ...interview, language: 'fr' }], [term()])).toEqual([])
  })
})

describe('scope (case by case or everywhere)', () => {
  it('is case by case when a spelling is short, everywhere otherwise', () => {
    expect(term().scope).toBe('global')
    expect(term({ form: 'NPS', variants: [] }).scope).toBe('case-by-case')
    expect(
      defaultScope({
        form: 'Goodresearch',
        variants: [{ spelling: 'GR', status: 'rejected', origin: 'ai' }],
      }),
    ).toBe('global')
  })

  it('follows the spellings until a person chooses, then stays', () => {
    const t = term()
    const short = absorb(t, checked({ variants: ['GRS'] }), LATER) as LexiconTerm
    expect(short.scope).toBe('case-by-case')
    const chosen = value(
      decideTerm(
        short,
        {
          decision: 'edit',
          fields: {
            form: 'Goodresearch',
            kind: 'domain',
            correction: null,
            category: 'product',
            definition: null,
            scope: 'global',
          },
        },
        'p1',
        LATER,
      ),
    )
    expect([chosen.scope, chosen.scopeDecided]).toEqual(['global', true])
    expect(absorb(chosen, checked({ variants: ['GDR'] }), LATER)?.scope).toBe('global')
  })
})

describe('occurrenceAt', () => {
  it('says whether a counted spelling of the term is written at a place', () => {
    const text = 'we use Gooresearch and NPS'
    expect(occurrenceAt(term(), text, 7)).toBe(true)
    expect(occurrenceAt(term(), text, 8)).toBe(false)
    expect(occurrenceAt(term(), text, text.indexOf('NPS'))).toBe(false)
  })
})

describe('overlapping spellings (review of PR #10)', () => {
  it('count one place once, for the longest spelling', () => {
    const acme = term({ form: 'Acme Cloud', variants: ['Acme'] }, 'acme')
    const rows = countOccurrences(
      [
        {
          sessionId: 's',
          language: 'en',
          segments: [
            { id: 'g', speaker: null, start: null, text: 'We use Acme Cloud, then Acme.' },
          ],
        },
      ],
      [acme],
    )
    expect(rows.map((r) => [r.spelling, r.count])).toEqual([
      ['Acme Cloud', 1],
      ['Acme', 1],
    ])
  })
})
