import { describe, expect, it } from 'vitest'
import type { Interview } from '../domain/candidates.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import { countOccurrences } from '../domain/occurrences.ts'

const NOW = new Date('2026-10-26T10:00:00Z')

const term = (id: string, form: string, variants: readonly string[] = []): LexiconTerm => ({
  id,
  teamId: 'team',
  language: 'fr',
  form,
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
  variants: variants.map((spelling) => ({ spelling, status: 'accepted', origin: 'ai' })),
  decidedBy: 'a1',
  decidedAt: NOW,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
})

/** A small seeded generator: the same words and the same order at each run. */
const random = (seed: number) => {
  let state = seed
  return (max: number) => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state % max
  }
}

// A large study: 57 interviews, 14 307 turns of 40 words, 438 terms (made-up words only).
const pick = random(7)
const vocabulary = Array.from({ length: 3000 }, (_, i) =>
  i % 50 === 0 ? `SIG${i % 1000}` : i % 7 === 0 ? `écrit${i}` : `mot${i}`,
)
const interviews: Interview[] = Array.from({ length: 57 }, (_, i) => ({
  sessionId: `s${i}`,
  language: 'fr',
  segments: Array.from({ length: 251 }, (_, j) => ({
    id: `s${i}-${j}`,
    speaker: 'A',
    text: Array.from({ length: 40 }, () => vocabulary[pick(3000)]).join(' '),
  })) as never,
}))
const terms = Array.from({ length: 438 }, (_, i) =>
  term(`t${i}`, vocabulary[i * 5] ?? 'mot', [`${vocabulary[i * 5 + 1]} ${vocabulary[i * 5 + 2]}`]),
)

describe('occurrences of a large study (fix: a decision on one term took 11 s)', () => {
  it('counts one term exactly as a recount of every term does', () => {
    const all = countOccurrences(interviews, terms)
    for (const id of ['t7', 't437']) {
      const one = terms.filter((t) => t.id === id)
      expect(countOccurrences(interviews, one)).toEqual(all.filter((o) => o.termId === id))
    }
    expect(all.length).toBeGreaterThan(1000)
    // A full count of this volume takes a few seconds on a slow CI runner.
  }, 60_000)

  it('counts one term quickly enough to answer a decision at once', () => {
    const one = terms.filter((t) => t.id === 't7')
    const started = performance.now()
    countOccurrences(interviews, one)
    // About 0.1 s on a laptop; the bound leaves room for a slow CI runner.
    expect(performance.now() - started).toBeLessThan(1500)
  })
})
