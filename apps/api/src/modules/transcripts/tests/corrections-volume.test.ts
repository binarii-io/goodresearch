import { fold, isAcronym, words } from '@goodresearch/shared'
import { describe, expect, it } from 'vitest'
import { lexiconCorrections, nameCorrections } from '../domain/corrections.ts'
import type { LexiconTerm } from '../domain/lexicon-term.ts'
import type { Segment } from '../domain/segments.ts'

const NOW = new Date('2026-10-26T10:00:00Z')

const term = (id: string, form: string, variants: readonly string[] = []): LexiconTerm => ({
  id,
  teamId: 'team',
  language: 'en',
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

const interview = (segments: Segment[]) => ({ sessionId: 's1', language: 'en' as const, segments })

/** The matching rule written the plain way: every spelling of every term over every word. */
const plainPlaces = (text: string, terms: readonly LexiconTerm[]) => {
  const all = words(text)
  const found: { start: number; end: number; termId: string }[] = []
  const used = terms.filter(
    (t) =>
      (t.status === 'accepted' || t.status === 'edited') &&
      t.category !== 'person' &&
      t.language === 'en',
  )
  for (const t of used)
    for (const spelling of [
      t.form,
      ...t.variants.filter((v) => v.status === 'accepted').map((v) => v.spelling),
    ]) {
      const wanted = words(spelling).map((w) => w.text)
      if (wanted.length === 0) continue
      for (let i = 0; i + wanted.length <= all.length; i++) {
        const same = wanted.every((w, k) => {
          const at = all[i + k]?.text ?? ''
          return isAcronym(w) ? w === at : fold(w) === fold(at)
        })
        if (!same) continue
        found.push({
          start: all[i]?.start ?? 0,
          end: all[i + wanted.length - 1]?.end ?? 0,
          termId: t.id,
        })
        i += wanted.length - 1
      }
    }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: typeof found = []
  let end = -1
  for (const m of found) {
    if (m.start < end) continue
    end = m.end
    kept.push(m)
  }
  return kept
}

describe('the lexicon matches over many turns', () => {
  it('finds the same places as the plain rule: overlaps, phrases, repeats, accents, acronyms', () => {
    const terms: LexiconTerm[] = [
      term('t1', 'Goodresearch', ['Gooresearch', 'good research']),
      term('t2', 'research'),
      term('t3', 'good research team'),
      term('t4', 'NPS'),
      term('t5', 'nps survey'),
      term('t6', 'Été', ['ete indien']),
      term('t7', 'la la'),
      term('t8', 'Research'),
      term('t9', 'good', ['good']),
      { ...term('t10', 'team'), category: 'person' },
      { ...term('t11', 'survey'), status: 'rejected' },
      { ...term('t12', 'word'), language: 'fr' },
      {
        ...term('t13', 'other'),
        variants: [{ spelling: 'indien', status: 'proposed', origin: 'ai' }],
      },
      term('t14', "l'été", ['co-op']),
    ]
    const vocabulary = [
      'good',
      'Good',
      'research',
      'RESEARCH',
      'team',
      'NPS',
      'nps',
      'Nps',
      'survey',
      'été',
      'ete',
      'indien',
      'la',
      'Gooresearch',
      'goodresearch',
      'other,',
      'word.',
      "l'été",
      'l’ete',
      'co-op',
    ]
    const next = random(42)
    for (let n = 0; n < 500; n++) {
      const text = Array.from({ length: next(25) }, () => vocabulary[next(vocabulary.length)]).join(
        ' ',
      )
      const found = lexiconCorrections(
        interview([{ id: 'g', speaker: null, start: null, text }]),
        terms,
        [],
        [],
      )
      const plain = plainPlaces(text, terms).filter((m) => {
        const form = terms.find((t) => t.id === m.termId)?.form
        return text.slice(m.start, m.end) !== form
      })
      expect(found.map((c) => [c.termId, c.offset, c.length])).toEqual(
        plain.map((m) => [m.termId, m.start, m.end - m.start]),
      )
    }
  })

  it('reads a study of 57 interviews and 14,000 turns in a moment', () => {
    const next = random(7)
    const common = Array.from({ length: 800 }, (_, i) => `word${i}`)
    const terms = Array.from({ length: 62 }, (_, i) =>
      term(`t${i}`, `Term${i}`, [`term ${i}`, `tirm${i}`, `Therm${i}`]),
    )
    const people = Array.from({ length: 6 }, (_, i) => ({
      name: `Person${i} Family${i}`,
      role: 'interviewee' as const,
      code: `P0${i + 1}`,
    }))
    const study = Array.from({ length: 57 }, (_, s) =>
      interview(
        Array.from({ length: 250 }, (_, g) => ({
          id: `s${s}g${g}`,
          speaker: null,
          start: null,
          text: Array.from({ length: 40 }, () =>
            next(50) === 0 ? `tirm${next(62)}` : common[next(common.length)],
          ).join(' '),
        })),
      ),
    )
    const started = performance.now()
    let found = 0
    for (const one of study) {
      found += lexiconCorrections(one, terms, [], []).length
      found += nameCorrections(one, people, terms, new Map()).length
    }
    const took = performance.now() - started
    expect(found).toBeGreaterThan(1000)
    // About 25 seconds before the words were indexed; the margin is for slow machines.
    expect(took).toBeLessThan(5000)
  })
})
