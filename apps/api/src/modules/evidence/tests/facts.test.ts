import { describe, expect, it } from 'vitest'
import {
  attachVerbatim,
  checkFacts,
  createFact,
  decideFact,
  type Fact,
  isRepeated,
  isReproposal,
} from '../domain/facts.ts'

const NOW = new Date('2026-10-28T10:00:00Z')
const names = ['Sam Example', 'Alex Martin']
const ids = new Map([
  ['v1', 'id-1'],
  ['v2', 'id-2'],
])
const themes = new Map([
  ['s1', { id: 'sec-1', title: 'Data' }],
  ['other', null],
])

const answer = (over: Partial<Parameters<typeof checkFacts>[0][number]> = {}) => ({
  statement: {
    en: 'Finding the team data takes several tools',
    fr: 'Trouver les données prend plusieurs outils',
  },
  polarity: 'negative' as const,
  theme: 's1',
  verbatims: ['v1', 'v2'],
  ...over,
})

describe('checkFacts (FR-006)', () => {
  it('keeps a fact citing known verbatims with a theme sent, both statements, no name', () => {
    const { kept, leftOut } = checkFacts([answer()], ids, themes, names)
    expect(leftOut).toBe(0)
    expect(kept).toEqual([
      {
        statement: {
          en: 'Finding the team data takes several tools',
          fr: 'Trouver les données prend plusieurs outils',
        },
        polarity: 'negative',
        theme: { id: 'sec-1', title: 'Data' },
        verbatimIds: ['id-1', 'id-2'],
      },
    ])
  })

  it('drops unknown ids, then a fact left without verbatim, a name, an unknown theme, an empty or long statement', () => {
    const { kept, leftOut } = checkFacts(
      [
        answer({ verbatims: ['v1', 'v9'] }),
        answer({ verbatims: ['v9'] }),
        answer({ statement: { en: 'Sam cannot find data', fr: 'Sam ne trouve pas' } }),
        answer({ theme: 's7' }),
        answer({ statement: { en: '', fr: 'x' } }),
        answer({ statement: { en: 'x'.repeat(201), fr: 'x' } }),
        answer({ theme: 'other' }),
      ],
      ids,
      themes,
      names,
    )
    expect(kept.map((f) => [f.verbatimIds, f.theme?.id ?? null])).toEqual([
      [['id-1'], 'sec-1'],
      [['id-1', 'id-2'], null],
    ])
    expect(leftOut).toBe(5)
  })
})

describe('isReproposal (R7)', () => {
  const rejected = {
    statement: { en: 'Finding the team data takes several tools', fr: 'Trouver les données' },
    verbatimIds: ['id-1', 'id-2'],
  }

  it('is the same verbatims, or most words of a decided statement', () => {
    expect(
      isReproposal({ statement: { en: 'Other', fr: 'Autre' }, verbatimIds: ['id-2'] }, [rejected]),
    ).toBe(true)
    expect(
      isReproposal(
        { statement: { en: 'Finding team data takes many tools', fr: 'x' }, verbatimIds: ['id-9'] },
        [rejected],
      ),
    ).toBe(true)
    expect(
      isReproposal(
        {
          statement: { en: 'The newsletter is useful', fr: 'La lettre est utile' },
          verbatimIds: ['id-3'],
        },
        [rejected],
      ),
    ).toBe(false)
  })
})

describe('isRepeated (one reading)', () => {
  const first = {
    statement: { en: 'Finding the team data takes several tools', fr: 'Trouver les données' },
    verbatimIds: ['id-1', 'id-2'],
  }

  it('is most words of a fact already proposed, not a shared verbatim', () => {
    expect(
      isRepeated({ statement: { en: 'The tool is slow', fr: "L'outil est lent" } }, [first]),
    ).toBe(false)
    expect(
      isRepeated({ statement: { en: 'Finding team data takes many tools', fr: 'x' } }, [first]),
    ).toBe(true)
  })
})

describe('Fact', () => {
  const base = {
    id: 'f1',
    sessionId: 's1',
    studyId: 'st',
    statement: { en: 'Data is hard to find', fr: 'Les données sont dures à trouver' },
    polarity: 'negative' as const,
    theme: null,
    verbatimIds: ['id-1'],
  }

  it('is created accepted by a person, with a verbatim and no name; the other language translates', () => {
    const made = createFact({
      ...base,
      statement: { en: 'Data is hard to find' },
      by: 'a1',
      now: NOW,
      names,
    })
    expect(made.ok && made.value).toMatchObject({
      status: 'accepted',
      origin: 'person',
      translation: 'translating',
      statement: { en: 'Data is hard to find', fr: '' },
      decidedBy: 'a1',
    })
    expect(createFact({ ...base, verbatimIds: [], by: 'a1', now: NOW, names })).toEqual({
      ok: false,
      error: 'FACT_NEEDS_VERBATIM',
    })
    expect(
      createFact({ ...base, statement: { en: 'Alex says so' }, by: 'a1', now: NOW, names }),
    ).toEqual({ ok: false, error: 'NAME_IN_STATEMENT' })
  })

  it('is accepted, rejected or edited with the version seen; an edit of one language translates the other', () => {
    const fact: Fact = {
      ...base,
      origin: 'ai',
      status: 'proposed',
      translation: 'done',
      runId: 'r1',
      decidedBy: null,
      decidedAt: null,
      version: 3,
    }
    expect(decideFact(fact, { decision: 'accept', version: 2 }, 'a1', NOW, names)).toEqual({
      ok: false,
      error: 'VERSION_CONFLICT',
    })
    const accepted = decideFact(fact, { decision: 'accept', version: 3 }, 'a1', NOW, names)
    expect(accepted.ok && accepted.value).toMatchObject({ status: 'accepted', version: 4 })
    const edited = decideFact(
      fact,
      {
        decision: 'edit',
        version: 3,
        statement: { fr: 'Les données manquent' },
        polarity: 'neutral',
      },
      'a1',
      NOW,
      names,
    )
    expect(edited.ok && edited.value).toMatchObject({
      status: 'edited',
      polarity: 'neutral',
      statement: { en: 'Data is hard to find', fr: 'Les données manquent' },
      translation: 'translating',
    })
    const both = decideFact(
      fact,
      { decision: 'edit', version: 3, statement: { en: 'A', fr: 'B' } },
      'a1',
      NOW,
      names,
    )
    expect(both.ok && both.value.translation).toBe('done')
    expect(
      decideFact(fact, { decision: 'edit', version: 3, verbatimIds: [] }, 'a1', NOW, names),
    ).toEqual({ ok: false, error: 'FACT_NEEDS_VERBATIM' })
  })

  it('gets one more verbatim without being decided: a proposed fact stays to decide', () => {
    const fact: Fact = {
      ...base,
      origin: 'ai',
      status: 'proposed',
      translation: 'done',
      runId: 'r1',
      decidedBy: null,
      decidedAt: null,
      version: 3,
    }
    expect(attachVerbatim(fact, 'id-2', 2)).toEqual({ ok: false, error: 'VERSION_CONFLICT' })
    const attached = attachVerbatim(fact, 'id-2', 3)
    expect(attached.ok && attached.value).toMatchObject({
      status: 'proposed',
      decidedBy: null,
      verbatimIds: ['id-1', 'id-2'],
      version: 4,
    })
    const again = attachVerbatim(fact, 'id-1', 3)
    expect(again.ok && again.value.verbatimIds).toEqual(['id-1'])
  })
})
