import { fold, quoteFound } from '@goodresearch/shared'
import type { Batch } from './excerpts.ts'

export type TermKind = 'domain' | 'suspect'
export type TermCategory =
  | 'product'
  | 'organisation'
  | 'place'
  | 'acronym'
  | 'jargon'
  | 'role'
  | 'person'
  | 'other'

/** One term of the AI's answer, as the schema lets it through (lengths unchecked). */
export type AnswerTerm = {
  readonly form: string
  readonly kind: TermKind
  readonly correction: string | null
  readonly category: TermCategory
  readonly definition: string | null
  readonly variants: readonly string[]
  readonly existingTerm: string | null
  readonly quote: string
}

/** A term proposal the app keeps: every variant and the quote checked (constitution IV). */
export type CheckedTerm = Omit<AnswerTerm, 'variants' | 'existingTerm'> & {
  /** The candidates' own spellings. */
  readonly variants: readonly string[]
  /** The accepted form it belongs to, when the AI named one the batch gave. */
  readonly existingForm: string | null
}

export const FORM_MAX = 80
export const DEFINITION_MAX = 200

const cut = (text: string, max: number) => Array.from(text.trim()).slice(0, max).join('')

/**
 * Research R5: a variant is kept only when it is one of the batch's candidates, the quote only when
 * the excerpts sent hold it; a term left without a variant or quote is dropped.
 */
export const checkAnswer = (batch: Batch, terms: readonly AnswerTerm[]): CheckedTerm[] => {
  const spellings = new Map(batch.candidates.map((c) => [fold(c.spelling), c.spelling]))
  const known = new Map(batch.knownForms.map((f) => [fold(f), f]))
  const sent = batch.candidates.flatMap((c) => c.excerpts).join('\n')
  const out: CheckedTerm[] = []
  const used = new Set<string>()
  for (const t of terms) {
    const form = cut(t.form, FORM_MAX)
    if (!form || !quoteFound(sent, t.quote)) continue
    // A candidate belongs to one term only: the first that claims it.
    const variants = [
      ...new Set(
        t.variants.flatMap((v) => {
          const own = spellings.get(fold(v))
          return own && !used.has(fold(own)) ? [own] : []
        }),
      ),
    ]
    if (variants.length === 0) continue
    for (const v of variants) used.add(fold(v))
    const correction = t.correction ? cut(t.correction, FORM_MAX) : null
    out.push({
      form,
      kind: t.kind,
      correction: t.kind === 'suspect' && correction ? correction : null,
      category: t.category,
      definition: t.definition ? cut(t.definition, DEFINITION_MAX) || null : null,
      variants,
      existingForm: t.existingTerm ? (known.get(fold(t.existingTerm)) ?? null) : null,
      quote: t.quote.trim(),
    })
  }
  return out
}
