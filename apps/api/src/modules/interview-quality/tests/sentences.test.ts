import { describe, expect, it } from 'vitest'
import { cutSentences } from '../domain/sentences.ts'

const texts = (text: string) => cutSentences('t3', text).map((s) => s.text)

describe('cutSentences (research R2)', () => {
  it('cuts at sentence ends, with ids and places in the turn', () => {
    const text = 'How did it go? I would like to know more. Tell me what happened!'
    const cut = cutSentences('t3', text)
    expect(cut.map((s) => s.id)).toEqual(['t3.1', 't3.2', 't3.3'])
    expect(cut.map((s) => s.text)).toEqual([
      'How did it go?',
      'I would like to know more.',
      'Tell me what happened!',
    ])
    for (const s of cut) expect(text.slice(s.offset, s.offset + s.length)).toBe(s.text)
  })

  it('cuts on an ellipsis and keeps grouped marks together', () => {
    expect(texts('So that was hard… What came next?! And after that one?')).toEqual([
      'So that was hard…',
      'What came next?!',
      'And after that one?',
    ])
  })

  it('keeps abbreviations and decimals whole', () => {
    expect(texts('You spent 3.5 hours on it, e.g. every week with Dr. Lee, is that so?')).toEqual([
      'You spent 3.5 hours on it, e.g. every week with Dr. Lee, is that so?',
    ])
    expect(texts('Vous voyez M. Dupont, etc. chaque semaine ?')).toEqual([
      'Vous voyez M. Dupont, etc. chaque semaine ?',
    ])
  })

  it('keeps the space before a French question mark inside the sentence', () => {
    expect(texts('Comment ça se passe ? Et ensuite, que faites-vous ?')).toEqual([
      'Comment ça se passe ?',
      'Et ensuite, que faites-vous ?',
    ])
  })

  it('leaves out fragments of at most 2 words, without numbering them', () => {
    const cut = cutSentences('t1', 'OK. I see. What did you do next?')
    expect(cut.map((s) => [s.id, s.text])).toEqual([['t1.1', 'What did you do next?']])
    expect(cutSentences('t1', 'Mm-hmm.')).toEqual([])
  })

  it('makes one sentence of a turn without punctuation', () => {
    expect(texts('so you were saying that the export takes a long time')).toEqual([
      'so you were saying that the export takes a long time',
    ])
  })
})
