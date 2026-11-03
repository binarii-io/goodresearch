import { err, fold, ok, type Result } from '@goodresearch/shared'
import type { CheckedTerm, TermCategory, TermKind } from './answer-check.ts'
import { editDistance, type KnownSpelling, type TermLanguage } from './candidates.ts'

export type TermStatus = 'proposed' | 'accepted' | 'edited' | 'rejected' | 'merged'
/**
 * Context map: `global`, every occurrence is the term (Cleaning corrects them all); `case-by-case`,
 * each occurrence is judged in its context (verdicts yes / no).
 */
export type TermScope = 'global' | 'case-by-case'
export type VariantStatus = 'proposed' | 'accepted' | 'rejected'

export type Variant = {
  readonly spelling: string
  readonly status: VariantStatus
  readonly origin: 'rules' | 'ai' | 'merge'
  /** Accepted by the app as close to a person's spelling, not by a person: never a reference. */
  readonly auto?: boolean | undefined
}

/** A term of a team's lexicon (context map LexiconTerm); one decision changes one term. */
export type LexiconTerm = {
  readonly id: string
  readonly teamId: string
  readonly language: TermLanguage
  /** The correct form; for a `suspect` term, what the transcription wrote. */
  readonly form: string
  readonly kind: TermKind
  /** For a `suspect` term: what it should read. */
  readonly correction: string | null
  readonly category: TermCategory
  readonly definition: string | null
  readonly scope: TermScope
  /** A person chose the scope: the app no longer changes it. */
  readonly scopeDecided: boolean
  readonly status: TermStatus
  readonly mergedInto: string | null
  readonly origin: 'rules' | 'ai'
  readonly quote: string | null
  readonly variants: readonly Variant[]
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type TermFields = {
  readonly form: string
  readonly kind: TermKind
  readonly correction: string | null
  readonly category: TermCategory
  readonly definition: string | null
  /** Left out: the app's default stays. */
  readonly scope?: TermScope | undefined
}

export type TermDecision = {
  readonly decision: 'accept' | 'reject' | 'reopen' | 'edit'
  readonly fields?: TermFields | undefined
  readonly variants?: readonly { spelling: string; status: 'accepted' | 'rejected' }[] | undefined
}

export type TermError =
  | 'INVALID_TRANSITION'
  | 'CORRECTION_REQUIRED'
  | 'MERGE_ITSELF'
  | 'LANGUAGE_DIFFERS'

/** Most variants of one term (data model). */
export const VARIANT_LIMIT = 50

const isDecided = (t: LexiconTerm) => t.status !== 'proposed'

/**
 * Context map: case by case when a spelling is short (3 letters or less: a word of the language as
 * often as the term), everywhere otherwise; a person's choice wins once set.
 */
export const defaultScope = (t: Pick<LexiconTerm, 'form' | 'variants'>): TermScope =>
  [t.form, ...t.variants.filter((v) => v.status !== 'rejected').map((v) => v.spelling)].some(
    (s) => Array.from(s.trim()).length <= 3,
  )
    ? 'case-by-case'
    : 'global'

const withScope = (t: LexiconTerm): LexiconTerm =>
  t.scopeDecided ? t : { ...t, scope: defaultScope(t) }

const touched = (t: LexiconTerm, now: Date): LexiconTerm => ({
  ...withScope(t),
  version: t.version + 1,
  updatedAt: now,
})

/** What a term stands for: the correction of a suspect term, the form of the others. */
export const targetOf = (t: Pick<LexiconTerm, 'form' | 'kind' | 'correction'>): string =>
  t.kind === 'suspect' && t.correction ? t.correction : t.form

/** Letters and digits only, folded: "l'boarding" and "lboarding" are one spelling. */
const squash = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, '')

/**
 * A spelling a reading finds is close to one a person accepted when it has 4 letters or more and
 * one letter differs (two from 6 letters): a slip of the transcription, corrected without asking.
 * Shorter spellings (often other acronyms) and distant ones may be another word: a person decides.
 */
export const closeToAccepted = (spelling: string, accepted: readonly string[]): boolean => {
  const s = squash(spelling)
  if (s.length < 4) return false
  const max = s.length >= 6 ? 2 : 1
  return accepted.some((a) => {
    const k = squash(a)
    return k.length > 0 && editDistance(s, k, max) <= max
  })
}

/** The spellings a person accepted for a term: its form, its correction, the variants they accepted. */
const acceptedSpellings = (t: LexiconTerm): string[] => [
  t.form,
  ...(t.correction ? [t.correction] : []),
  ...t.variants.filter((v) => v.status === 'accepted' && !v.auto).map((v) => v.spelling),
]

/** Adds spellings the term does not hold yet (form, word it stands for, variant), up to the limit. */
const withVariants = (
  term: LexiconTerm,
  spellings: readonly string[],
  status: VariantStatus | ((spelling: string) => Pick<Variant, 'status' | 'auto'>),
  origin: Variant['origin'],
): Variant[] => {
  const held = new Set([
    fold(term.form),
    fold(targetOf(term)),
    ...term.variants.map((v) => fold(v.spelling)),
  ])
  const out = [...term.variants]
  for (const spelling of spellings) {
    if (out.length >= VARIANT_LIMIT || held.has(fold(spelling))) continue
    held.add(fold(spelling))
    out.push({
      spelling,
      origin,
      ...(typeof status === 'function' ? status(spelling) : { status }),
    })
  }
  return out
}

/**
 * On a term a person decided, a spelling close to one they accepted is accepted at once (marked
 * `auto`), a distant one proposed. A person's name is never corrected without a person.
 */
const statusFor =
  (term: LexiconTerm) =>
  (spelling: string): Pick<Variant, 'status' | 'auto'> =>
    isDecided(term) &&
    term.status !== 'rejected' &&
    term.category !== 'person' &&
    closeToAccepted(spelling, acceptedSpellings(term))
      ? { status: 'accepted', auto: true }
      : { status: 'proposed' }

/** A new term from a checked AI proposal: proposed, its other spellings as proposed variants. */
export const proposeTerm = (
  checked: CheckedTerm,
  at: { id: string; teamId: string; language: TermLanguage; now: Date },
): LexiconTerm => {
  const term: LexiconTerm = {
    id: at.id,
    teamId: at.teamId,
    language: at.language,
    form: checked.form,
    kind: checked.kind,
    correction: checked.correction,
    category: checked.category,
    definition: checked.definition,
    scope: 'global',
    scopeDecided: false,
    status: 'proposed',
    mergedInto: null,
    origin: 'ai',
    quote: checked.quote,
    variants: [],
    decidedBy: null,
    decidedAt: null,
    version: 1,
    createdAt: at.now,
    updatedAt: at.now,
  }
  return withScope({ ...term, variants: withVariants(term, checked.variants, 'proposed', 'ai') })
}

/**
 * Research R7: a new reading only adds spellings to a term (the proposal's form too, when it stands
 * for the same word); a term still proposed may take the new kind, category, definition and quote.
 * On a term a person validated, a spelling close to an accepted one is accepted at once (Cleaning
 * corrects it), a distant one waits for a person. Null when nothing changes. A rejected spelling is
 * held, so it never comes back.
 */
export const absorb = (term: LexiconTerm, checked: CheckedTerm, now: Date): LexiconTerm | null => {
  if (term.status === 'merged') return null
  const variants = withVariants(term, [checked.form, ...checked.variants], statusFor(term), 'ai')
  const refresh = !isDecided(term)
  const next: LexiconTerm = {
    ...term,
    variants,
    ...(refresh
      ? {
          kind: checked.kind,
          correction: checked.correction,
          category: checked.category,
          definition: checked.definition ?? term.definition,
          quote: checked.quote,
        }
      : {}),
  }
  const same =
    variants.length === term.variants.length &&
    next.kind === term.kind &&
    next.correction === term.correction &&
    next.category === term.category &&
    next.definition === term.definition &&
    next.quote === term.quote
  return same ? null : touched(next, now)
}

const decideVariants = (
  variants: readonly Variant[],
  decided: TermDecision['variants'],
  acceptProposed: boolean,
): Variant[] =>
  variants.map((v) => {
    const choice = decided?.find((d) => fold(d.spelling) === fold(v.spelling))
    if (choice) return { ...v, status: choice.status }
    return acceptProposed && v.status === 'proposed' ? { ...v, status: 'accepted' } : v
  })

/**
 * Spec FR-010, data model transitions: accepting or editing takes the proposed variants too (unless
 * decided one by one); rejecting keeps them (the term's spellings are then never proposed again);
 * reopening brings a rejected term back to proposed.
 */
export const decideTerm = (
  term: LexiconTerm,
  d: TermDecision,
  actor: string,
  now: Date,
): Result<LexiconTerm, TermError> => {
  if (term.status === 'merged') return err('INVALID_TRANSITION')
  const decided = (t: LexiconTerm): LexiconTerm =>
    touched({ ...t, decidedBy: actor, decidedAt: now }, now)
  switch (d.decision) {
    case 'accept': {
      if (term.status === 'rejected') return err('INVALID_TRANSITION')
      if (term.kind === 'suspect' && !term.correction) return err('CORRECTION_REQUIRED')
      return ok(
        decided({
          ...term,
          status: term.status === 'edited' ? 'edited' : 'accepted',
          variants: decideVariants(term.variants, d.variants, true),
        }),
      )
    }
    case 'edit': {
      const f = d.fields
      if (!f || term.status === 'rejected') return err('INVALID_TRANSITION')
      if (f.kind === 'suspect' && !f.correction) return err('CORRECTION_REQUIRED')
      const base: LexiconTerm = {
        ...term,
        form: f.form.trim(),
        kind: f.kind,
        correction: f.kind === 'suspect' ? (f.correction?.trim() ?? null) : null,
        category: f.category,
        definition: f.definition?.trim() || null,
        ...(f.scope ? { scope: f.scope, scopeDecided: true } : {}),
        status: 'edited',
      }
      // The old form stays a spelling of the term when it changes.
      const variants =
        fold(base.form) === fold(term.form)
          ? term.variants
          : withVariants({ ...base, variants: term.variants }, [term.form], 'accepted', 'merge')
      return ok(
        decided({
          ...base,
          variants: decideVariants(
            variants.filter((v) => fold(v.spelling) !== fold(base.form)),
            d.variants,
            true,
          ),
        }),
      )
    }
    case 'reject':
      return ok(
        decided({
          ...term,
          status: 'rejected',
          variants: decideVariants(term.variants, d.variants, false),
        }),
      )
    case 'reopen':
      if (term.status !== 'rejected') return err('INVALID_TRANSITION')
      return ok(touched({ ...term, status: 'proposed', decidedBy: null, decidedAt: null }, now))
  }
}

/**
 * Research R7: merging `from` into `into` moves its spellings to `into` (accepted, or rejected when
 * they were) and marks `from` merged; `into` counts as decided.
 */
export const mergeTerms = (
  from: LexiconTerm,
  into: LexiconTerm,
  actor: string,
  now: Date,
): Result<{ from: LexiconTerm; into: LexiconTerm }, TermError> => {
  if (from.id === into.id) return err('MERGE_ITSELF')
  if (from.language !== into.language) return err('LANGUAGE_DIFFERS')
  if (from.status === 'merged' || into.status === 'merged' || into.status === 'rejected')
    return err('INVALID_TRANSITION')
  const rejected = from.status === 'rejected'
  const moved: { spelling: string; status: VariantStatus }[] = [
    { spelling: from.form, status: rejected ? 'rejected' : 'accepted' },
    ...from.variants.map((v) => ({
      spelling: v.spelling,
      status: rejected || v.status === 'rejected' ? ('rejected' as const) : ('accepted' as const),
    })),
  ]
  let variants = [...into.variants]
  for (const m of moved) {
    variants = withVariants({ ...into, variants }, [m.spelling], m.status, 'merge')
  }
  return ok({
    from: touched(
      { ...from, status: 'merged', mergedInto: into.id, decidedBy: actor, decidedAt: now },
      now,
    ),
    into: touched(
      {
        ...into,
        variants,
        status: into.status === 'proposed' ? 'accepted' : into.status,
        decidedBy: actor,
        decidedAt: now,
      },
      now,
    ),
  })
}

/**
 * A term still proposed that stands for the same word as a validated one joins it: its spellings
 * become the validated term's (close ones accepted, distant ones proposed, rejected ones kept
 * rejected) and it is merged into it, by the app (no person decided it).
 */
export const attachTo = (
  from: LexiconTerm,
  into: LexiconTerm,
  now: Date,
): { from: LexiconTerm; into: LexiconTerm } => {
  const close = statusFor(into)
  let variants = [...into.variants]
  for (const [spelling, rejected] of [
    [from.form, false] as const,
    ...from.variants.map((v) => [v.spelling, v.status === 'rejected'] as const),
  ])
    variants = withVariants(
      { ...into, variants },
      [spelling],
      rejected ? 'rejected' : close,
      'merge',
    )
  return {
    from: touched({ ...from, status: 'merged', mergedInto: into.id }, now),
    into: touched({ ...into, variants }, now),
  }
}

/** The spellings of a term for the rules (research R4): merged terms gave theirs away. */
export const spellingsOf = (term: LexiconTerm): KnownSpelling[] => {
  if (term.status === 'merged') return []
  const rejected = term.status === 'rejected'
  const accepted = term.status === 'accepted' || term.status === 'edited'
  const base = { termId: term.id, language: term.language }
  return [
    { ...base, spelling: term.form, state: rejected ? 'rejected' : 'active', accepted },
    ...term.variants.map(
      (v): KnownSpelling => ({
        ...base,
        spelling: v.spelling,
        state: rejected || v.status === 'rejected' ? 'rejected' : 'active',
        accepted: false,
      }),
    ),
  ]
}

/**
 * The spellings counted in the transcripts: the form and the variants not rejected. A rejected term
 * is counted too, so the lexicon still shows where it was found.
 */
export const countedSpellings = (term: LexiconTerm): string[] =>
  term.status === 'merged'
    ? []
    : [term.form, ...term.variants.filter((v) => v.status !== 'rejected').map((v) => v.spelling)]

/** Proposed terms, and decided ones with proposed variants: what is left to decide. */
export const toDecide = (term: LexiconTerm): boolean =>
  term.status === 'proposed' ||
  ((term.status === 'accepted' || term.status === 'edited') &&
    term.variants.some((v) => v.status === 'proposed'))
