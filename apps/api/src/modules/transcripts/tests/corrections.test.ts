import { describe, expect, it } from 'vitest'
import {
  analysedCorrections,
  applyCorrections,
  type Correction,
  caseByCaseToDecide,
  effectiveCorrections,
  fingerprint,
  inherit,
  lexiconCorrections,
  nameCorrections,
  resolveCorrections,
  toRawOffset,
} from '../domain/corrections.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import type { Verdict } from '../domain/occurrences.ts'
import type { Segment } from '../domain/segments.ts'

const NOW = new Date('2026-10-26T10:00:00Z')

const term = (over: Partial<LexiconTerm> = {}): LexiconTerm => ({
  id: 't1',
  teamId: 'team',
  language: 'en',
  form: 'Goodresearch',
  kind: 'domain',
  correction: null,
  category: 'product',
  definition: null,
  scope: 'global',
  scopeDecided: true,
  status: 'accepted',
  mergedInto: null,
  origin: 'ai',
  quote: null,
  variants: [
    { spelling: 'Gooresearch', status: 'accepted', origin: 'ai' },
    { spelling: 'good research', status: 'proposed', origin: 'ai' },
  ],
  decidedBy: 'a1',
  decidedAt: NOW,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
})

const seg = (id: string, text: string, speaker: string | null = 'Lee'): Segment => ({
  id,
  speaker,
  start: null,
  text,
})

const interview = (segments: Segment[]) => ({ sessionId: 's1', language: 'en' as const, segments })

const verdict = (
  offset: number,
  v: Verdict['verdict'],
  segmentId = 'g1',
  termId = 't1',
): Verdict => ({
  termId,
  sessionId: 's1',
  segmentId,
  offset,
  verdict: v,
  decidedBy: 'a2',
  decidedAt: NOW,
})

describe('lexiconCorrections (FR-003)', () => {
  const text = 'We use Gooresearch daily, gooresearch too, and good research.'

  it('corrects every accepted spelling of a global term, accepted by default', () => {
    const found = lexiconCorrections(interview([seg('g1', text)]), [term()], [], [])
    expect(found.map((c) => [c.original, c.replacement, c.status, c.source])).toEqual([
      ['Gooresearch', 'Goodresearch', 'accepted', 'lexicon'],
      ['gooresearch', 'Goodresearch', 'accepted', 'lexicon'],
    ])
    expect(found[0]?.key).toBe('lex:t1:g1:7')
  })

  it('keeps a "no" verdict as a rejected correction, decided by its author', () => {
    const [first] = lexiconCorrections(
      interview([seg('g1', text)]),
      [term()],
      [verdict(7, 'no')],
      [],
    )
    expect(first?.status).toBe('rejected')
    expect(first?.decidedBy).toBe('a2')
  })

  it('leaves an "unsure" place to decide in Cleaning, global or case by case, without the AI', () => {
    const nps = term({
      id: 't2',
      form: 'NPS',
      scope: 'case-by-case',
      variants: [{ spelling: 'MPS', status: 'accepted', origin: 'ai' }],
    })
    const found = lexiconCorrections(
      interview([seg('g1', text), seg('g2', 'The MPS went up.')]),
      [term(), nps],
      [verdict(7, 'unsure'), verdict(4, 'unsure', 'g2', 't2')],
      [],
    )
    expect(found.map((c) => [c.key, c.status, c.source, c.decidedBy])).toEqual([
      ['lex:t1:g1:7', 'proposed', 'lexicon', null],
      ['lex:t1:g1:26', 'accepted', 'lexicon', null],
      ['lex:t2:g2:4', 'proposed', 'lexicon', null],
    ])
    expect(
      caseByCaseToDecide(
        interview([seg('g2', 'The MPS went up.')]),
        [nps],
        [verdict(4, 'unsure', 'g2', 't2')],
      ),
    ).toEqual([])
  })

  it('gives nothing for a spelling already equal to the form, nor for proposed or rejected terms', () => {
    const plain = interview([seg('g1', 'Goodresearch works.')])
    expect(lexiconCorrections(plain, [term()], [], [])).toEqual([])
    expect(
      lexiconCorrections(interview([seg('g1', text)]), [term({ status: 'proposed' })], [], []),
    ).toEqual([])
    expect(
      lexiconCorrections(interview([seg('g1', text)]), [term({ status: 'rejected' })], [], []),
    ).toEqual([])
  })

  it('corrects the case of the form itself', () => {
    const found = lexiconCorrections(
      interview([seg('g1', 'goodresearch works.')]),
      [term()],
      [],
      [],
    )
    expect(found.map((c) => c.replacement)).toEqual(['Goodresearch'])
  })

  it('uses the correction of a suspect term', () => {
    const suspect = term({ form: 'eating', kind: 'suspect', correction: 'meeting', variants: [] })
    const found = lexiconCorrections(
      interview([seg('g1', 'The eating was long.')]),
      [suspect],
      [],
      [],
    )
    expect(found.map((c) => [c.original, c.replacement, c.kind])).toEqual([
      ['eating', 'meeting', 'transcription'],
    ])
  })

  it('case by case: yes accepted, no rejected, an AI yes proposed, otherwise nothing', () => {
    const nps = term({
      id: 't2',
      form: 'NPS',
      scope: 'case-by-case',
      variants: [{ spelling: 'MPS', status: 'accepted', origin: 'ai' }],
    })
    const t = 'MPS one, MPS two, MPS three, MPS four.'
    const found = lexiconCorrections(
      interview([seg('g1', t)]),
      [nps],
      [verdict(0, 'yes', 'g1', 't2'), verdict(9, 'no', 'g1', 't2')],
      [
        {
          termId: 't2',
          sessionId: 's1',
          segmentId: 'g1',
          offset: 18,
          isTerm: true,
          reason: 'the score',
        },
        { termId: 't2', sessionId: 's1', segmentId: 'g1', offset: 29, isTerm: false, reason: null },
      ],
    )
    expect(found.map((c) => [c.offset, c.status, c.source])).toEqual([
      [0, 'accepted', 'lexicon'],
      [9, 'rejected', 'lexicon'],
      [18, 'proposed', 'ai-lexicon'],
    ])
    expect(found[2]?.reason).toBe('the score')
  })

  it('lists the case-by-case places left to decide', () => {
    const nps = term({
      id: 't2',
      form: 'NPS',
      scope: 'case-by-case',
      variants: [{ spelling: 'MPS', status: 'accepted', origin: 'ai' }],
    })
    const places = caseByCaseToDecide(
      interview([seg('g1', 'MPS and MPS, NPS')]),
      [nps],
      [verdict(0, 'yes', 'g1', 't2')],
    )
    expect(places).toEqual([
      { termId: 't2', segmentId: 'g1', offset: 8, length: 3, spelling: 'MPS', form: 'NPS' },
    ])
  })

  it('takes the longest spelling where terms overlap', () => {
    const cloud = term({
      id: 't3',
      form: 'Acme Cloud',
      variants: [{ spelling: 'acme clood', status: 'accepted', origin: 'ai' }],
    })
    const acme = term({
      id: 't4',
      form: 'ACME',
      variants: [{ spelling: 'acme', status: 'accepted', origin: 'ai' }],
    })
    const found = lexiconCorrections(
      interview([seg('g1', 'the acme clood app')]),
      [acme, cloud],
      [],
      [],
    )
    expect(found.map((c) => [c.original, c.replacement])).toEqual([['acme clood', 'Acme Cloud']])
  })

  it('leaves out people and terms of another language', () => {
    expect(
      lexiconCorrections(interview([seg('g1', text)]), [term({ category: 'person' })], [], []),
    ).toEqual([])
    expect(
      lexiconCorrections(interview([seg('g1', text)]), [term({ language: 'fr' })], [], []),
    ).toEqual([])
  })
})

describe('nameCorrections (FR-012)', () => {
  const people = [
    { name: 'Sam Example', role: 'interviewee' as const, code: 'P01' },
    { name: 'Alex Sample', role: 'interviewer' as const, code: 'I01' },
  ]

  it('replaces interviewees by their pseudonym and interviewers by their label, in the text and the speakers', () => {
    const found = nameCorrections(
      interview([
        seg('g1', 'Thanks Sam Example, and Sam again.', 'Alex Sample'),
        seg('g2', 'Yes Alex.', 'Sam'),
      ]),
      people,
      [],
      new Map(),
    )
    expect(found.map((c) => [c.segmentId, c.target, c.original, c.replacement])).toEqual([
      ['g1', 'speaker', 'Alex Sample', 'Interviewer 1'],
      ['g1', 'text', 'Sam Example', 'P01'],
      ['g1', 'text', 'Sam', 'P01'],
      ['g2', 'speaker', 'Sam', 'P01'],
      ['g2', 'text', 'Alex', 'Interviewer 1'],
    ])
    expect(found.every((c) => c.status === 'accepted' && c.source === 'name')).toBe(true)
    expect(found[1]?.key).toBe('name:g1:text:7')
  })

  it('writes the labels in French for a French interview', () => {
    const fr = {
      sessionId: 's1',
      language: 'fr' as const,
      segments: [seg('g1', 'Merci Alex.', null)],
    }
    const person = term({ id: 'p', category: 'person', form: 'Lee', variants: [], language: 'fr' })
    const found = nameCorrections(
      { ...fr, segments: [seg('g1', 'Merci Alex et Lee.', null)] },
      people,
      [person],
      new Map(),
    )
    expect(found.map((c) => c.replacement)).toEqual(['Intervieweur 1', '[Personne]'])
  })

  it('skips a word two people share, and follows a decision', () => {
    const twins = [...people, { name: 'Sam Other', role: 'interviewee' as const, code: 'P02' }]
    const found = nameCorrections(interview([seg('g1', 'Sam said', null)]), twins, [], new Map())
    expect(found).toEqual([])
    const undone = nameCorrections(
      interview([seg('g1', 'Sam said', null)]),
      people,
      [],
      new Map([
        [
          'name:g1:text:0',
          { status: 'rejected' as const, edited: null, decidedBy: 'a1', decidedAt: NOW },
        ],
      ]),
    )
    expect(undone[0]?.status).toBe('rejected')
  })
})

const stored = (over: Partial<Correction>): Correction => ({
  key: 'c1',
  sessionId: 's1',
  segmentId: 'g1',
  target: 'text',
  offset: 0,
  length: 3,
  original: 'abc',
  replacement: 'xyz',
  edited: null,
  kind: 'transcription',
  source: 'ai-other',
  reason: null,
  confidence: 'high',
  termId: null,
  status: 'proposed',
  decidedBy: null,
  decidedAt: null,
  version: 1,
  ...over,
})

describe('resolve, apply, fingerprint (FR-008, FR-011)', () => {
  it('keeps one correction per place: person > lexicon > name > ai-lexicon > ai-other, then the longest', () => {
    const all = [
      stored({ key: 'ai', offset: 4, length: 7, original: 'eating ', source: 'ai-other' }),
      stored({
        key: 'lex',
        offset: 4,
        length: 6,
        original: 'eating',
        source: 'lexicon',
        status: 'accepted',
      }),
      stored({ key: 'far', offset: 20, length: 2, original: 'ok', source: 'ai-other' }),
      stored({
        key: 'gone',
        offset: 4,
        length: 6,
        original: 'eating',
        source: 'person',
        status: 'rejected',
      }),
    ]
    const resolved = resolveCorrections(all)
    expect(resolved.filter((c) => c.overridden).map((c) => c.key)).toEqual(['ai'])
    expect(effectiveCorrections(all).map((c) => c.key)).toEqual(['lex'])
  })

  it('spec 012: the text analysed applies every correction not rejected, proposed ones included', () => {
    const all = [
      stored({ key: 'proposed', offset: 0, length: 3 }),
      stored({ key: 'accepted', offset: 10, length: 3, status: 'accepted' }),
      stored({ key: 'rejected', offset: 20, length: 3, status: 'rejected' }),
      stored({ key: 'under', offset: 10, length: 2, source: 'ai-other' }),
      stored({ key: 'edited', offset: 30, length: 3, status: 'edited', edited: 'q' }),
    ]
    expect(analysedCorrections(all).map((c) => c.key)).toEqual(['proposed', 'accepted', 'edited'])
  })

  it('applies accepted and edited corrections, maps offsets back, and changes speakers only by target', () => {
    const segments = [seg('g1', 'The eating was fine, NPS ok.')]
    const corrections = [
      stored({
        key: 'a',
        offset: 4,
        length: 6,
        original: 'eating',
        replacement: 'meeting',
        status: 'accepted',
      }),
      stored({
        key: 'b',
        offset: 21,
        length: 3,
        original: 'NPS',
        replacement: 'MPS',
        edited: 'NPS score',
        status: 'edited',
      }),
      stored({
        key: 'c',
        target: 'speaker',
        offset: 0,
        length: 3,
        original: 'Lee',
        replacement: 'Sam',
        status: 'accepted',
      }),
    ]
    const { segments: clean, maps } = applyCorrections(segments, corrections)
    expect(clean[0]).toEqual({
      id: 'g1',
      speaker: 'Sam',
      start: null,
      text: 'The meeting was fine, NPS score ok.',
    })
    const map = maps.get('g1') ?? []
    expect(toRawOffset(map, 0)).toBe(0)
    expect(toRawOffset(map, 12)).toBe(11)
    expect(toRawOffset(map, 5)).toBeNull()
  })

  it('gives the same fingerprint whatever the order, another one when a replacement changes', () => {
    const a = stored({ key: 'a', status: 'accepted' })
    const b = stored({ key: 'b', offset: 5, status: 'accepted' })
    expect(fingerprint([a, b])).toBe(fingerprint([b, a]))
    expect(fingerprint([a, b])).not.toBe(
      fingerprint([a, { ...b, edited: 'other', status: 'edited' }]),
    )
  })
})

describe('inherit (FR-008)', () => {
  it('gives a new AI correction the decision of the same one decided before', () => {
    const decided = stored({ status: 'rejected', decidedBy: 'a1', decidedAt: NOW, offset: 9 })
    const [next, other] = inherit(
      [stored({ key: 'n1', offset: 2 }), stored({ key: 'n2', replacement: 'qqq' })],
      [decided],
    )
    expect([next?.status, next?.decidedBy]).toEqual(['rejected', 'a1'])
    expect(other?.status).toBe('proposed')
  })
})
