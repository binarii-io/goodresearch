import { describe, expect, it } from 'vitest'
import type { QualityAi } from '../application/ports.ts'
import { checkAnswer } from '../domain/remarks.ts'
import { cutSentences } from '../domain/sentences.ts'
import { SIMPLE, WITH_OPINION } from './reference/excerpts.ts'
import { meetsTargets, runReference } from './reference/run.ts'

const flagged = (sentence: string, said: string, addedElement: string | null) => {
  const sentences = cutSentences('t1', sentence)
  return checkAnswer({
    sentences,
    earlierWords: said,
    answers: sentences.map((s) => ({
      id: s.id,
      kind: 'question' as const,
      flag: {
        kind: 'reformulation-with-opinion' as const,
        reason: { en: 'x', fr: 'x' },
        recommendation: null,
        addedElement,
        excerpt: null,
      },
    })),
  })
}

describe('the reference set (research R9), with a fake answer', () => {
  it('holds enough excerpts, each one sentence as the app cuts it', () => {
    expect(SIMPLE.length).toBeGreaterThanOrEqual(30)
    expect(WITH_OPINION.length).toBeGreaterThanOrEqual(20)
    for (const e of [...SIMPLE, ...WITH_OPINION])
      expect(cutSentences('t1', e.sentence)).toHaveLength(1)
  })

  it('turns every simple reformulation wrongly flagged without an element into a simple one', () => {
    for (const e of SIMPLE) {
      const out = flagged(e.sentence, e.said, null)
      expect(out.remarks).toEqual([])
      expect(out.simple).toHaveLength(1)
    }
  })

  it('turns a simple reformulation whose element repeats the interviewee into a simple one', () => {
    for (const e of SIMPLE) expect(flagged(e.sentence, e.said, e.said).remarks).toEqual([])
  })

  it('keeps every reformulation with opinion whose element the interviewee never said', () => {
    for (const e of WITH_OPINION)
      expect(flagged(e.sentence, e.said, e.added ?? null).remarks).toHaveLength(1)
  })
})

describe('the reference runner, with a fake provider', () => {
  const set = { simple: SIMPLE.slice(0, 30), withOpinion: WITH_OPINION.slice(0, 20) }
  const answering =
    (flagging: (sentence: string) => boolean): QualityAi['review'] =>
    async (_a, _r, request) =>
      request.turns.flatMap((t) =>
        t.sentences.map((s) => ({
          id: s.id,
          kind: 'question' as const,
          flag: flagging(s.text)
            ? {
                kind: 'reformulation-with-opinion' as const,
                reason: { en: 'x', fr: 'x' },
                recommendation: null,
                addedElement: 'something entirely unsaid',
                excerpt: null,
              }
            : undefined,
        })),
      )

  it('reports what was flagged wrongly and what was missed, one call per excerpt', async () => {
    const opinions = new Set(set.withOpinion.map((e) => e.sentence))
    const perfect = await runReference(
      answering((s) => opinions.has(s)),
      'a1',
      set,
    )
    expect(perfect).toMatchObject({ simpleFlagged: [], opinionMissed: [], calls: 50 })
    expect(meetsTargets(perfect)).toBe(true)
  })

  it('fails the targets above 1 in 30 simple flagged, or below 80% found', async () => {
    const all = await runReference(
      answering(() => true),
      'a1',
      set,
    )
    expect(all.simpleFlagged).toHaveLength(30)
    expect(meetsTargets(all)).toBe(false)
    const none = await runReference(
      answering(() => false),
      'a1',
      set,
    )
    expect(none.opinionMissed).toHaveLength(20)
    expect(meetsTargets(none)).toBe(false)
  })
})
