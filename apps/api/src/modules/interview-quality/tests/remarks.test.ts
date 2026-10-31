import { describe, expect, it } from 'vitest'
import { checkAnswer, type SentAnswer } from '../domain/remarks.ts'
import { cutSentences } from '../domain/sentences.ts'

const flag = (over: Partial<NonNullable<SentAnswer['flag']>> = {}) => ({
  kind: 'leading-question' as const,
  reason: { en: 'It suggests the answer.', fr: 'Elle suggère la réponse.' },
  recommendation: 'How did this step go?',
  addedElement: null,
  excerpt: null,
  ...over,
})

const check = (
  text: string,
  answers: SentAnswer[],
  earlier = 'I export the file every week and then I send it',
) => checkAnswer({ sentences: cutSentences('t1', text), answers, earlierWords: earlier })

describe('checkAnswer (research R3, R4, FR-004)', () => {
  it('keeps the sentence given by the app as the remark text', () => {
    const out = check('You find this too complicated, right? And then?', [
      { id: 't1.1', kind: 'question', flag: flag() },
    ])
    expect(out.remarks.map((r) => [r.sentence.id, r.text, r.kind])).toEqual([
      ['t1.1', 'You find this too complicated, right?', 'leading-question'],
    ])
    expect(out.questions).toBe(1)
    expect(out.leftOut).toBe(0)
  })

  it('counts a question and a simple reformulation, and a missing sentence as other', () => {
    const out = check('How did it go then? So you export every week? I would add one thing.', [
      { id: 't1.1', kind: 'question' },
      { id: 't1.2', kind: 'simple-reformulation' },
    ])
    expect(out.questions).toBe(1)
    expect(out.simple.map((s) => s.id)).toEqual(['t1.2'])
    expect(out.remarks).toEqual([])
  })

  it('drops an answer on a sentence that was not sent, and counts it', () => {
    const out = check('How did it go then?', [{ id: 't9.1', kind: 'question', flag: flag() }])
    expect(out.questions).toBe(0)
    expect(out.remarks).toEqual([])
    expect(out.leftOut).toBe(1)
  })

  it('counts a leading question as a question whatever kind came with it', () => {
    const out = check('You find this too hard, right?', [
      { id: 't1.1', kind: 'other', flag: flag() },
    ])
    expect(out.questions).toBe(1)
  })

  it('shows the excerpt, in the turn own words, when it is inside the sentence', () => {
    const text = 'so i was wondering whether you find this too complicated for your team to use'
    const out = check(text, [
      { id: 't1.1', kind: 'question', flag: flag({ excerpt: 'FIND THIS  too complicated' }) },
    ])
    expect(out.remarks[0]?.text).toBe('find this too complicated')
    const offset = out.remarks[0]?.offset ?? 0
    expect(text.slice(offset, offset + (out.remarks[0]?.length ?? 0))).toBe(
      'find this too complicated',
    )
  })

  it('drops a remark whose excerpt is not in the sentence, keeps its classification', () => {
    const out = check('How did the export go for you?', [
      { id: 't1.1', kind: 'question', flag: flag({ excerpt: 'words never said here' }) },
    ])
    expect(out.remarks).toEqual([])
    expect(out.questions).toBe(1)
    expect(out.leftOut).toBe(1)
  })

  it('keeps one remark per sentence, the first found', () => {
    const out = check('You find this too hard, right?', [
      { id: 't1.1', kind: 'question', flag: flag() },
      { id: 't1.1', kind: 'question', flag: flag({ kind: 'opinion' }) },
    ])
    expect(out.remarks.map((r) => r.kind)).toEqual(['leading-question'])
    expect(out.questions).toBe(1)
  })

  describe('a reformulation with opinion', () => {
    const asked = 'So you export it every week because the tool is too slow?'
    const withElement = (addedElement: string | null) => [
      {
        id: 't1.1',
        kind: 'question' as const,
        flag: flag({ kind: 'reformulation-with-opinion', addedElement }),
      },
    ]

    it('is kept when what it adds was not said', () => {
      const out = check(asked, withElement('the tool is too slow'))
      expect(out.remarks[0]?.kind).toBe('reformulation-with-opinion')
      expect(out.remarks[0]?.addedElement).toBe('the tool is too slow')
      expect(out.simple).toEqual([])
    })

    it('becomes simple without an added element, and counts as left out', () => {
      for (const element of [null, '', 'it is so']) {
        const out = check(asked, withElement(element))
        expect(out.remarks).toEqual([])
        expect(out.simple.map((s) => s.id)).toEqual(['t1.1'])
        expect(out.leftOut).toBe(1)
      }
    })

    it('becomes simple when what it adds was said earlier, whatever the case or accents', () => {
      const out = check(asked, withElement('Tool is too SLOW'), 'honestly the tool is way too slow')
      expect(out.remarks).toEqual([])
      expect(out.simple.map((s) => s.id)).toEqual(['t1.1'])
      expect(out.leftOut).toBe(1)
      const fr = check(
        'Donc vous exportez parce que l’outil est trop lent ?',
        withElement('Outil trop lént'),
        'l’outil est vraiment trop lent',
      )
      expect(fr.remarks).toEqual([])
    })

    it('stays flagged when only part of what it adds was said', () => {
      const out = check(asked, withElement('tool slow'), 'the tool is fine')
      expect(out.remarks).toHaveLength(1)
    })
  })
})
