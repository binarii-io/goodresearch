import { err, holdsName, ok, type Result, sharedWords } from '@goodresearch/shared'

/** FR-006: a statement is short and neutral, in English and French. */
export const STATEMENT_MAX = 200
/** Research R7: a statement sharing this share of its words with a decided one is the same fact. */
const SAME_WORDS = 0.6

export type Polarity = 'positive' | 'negative' | 'neutral'
export type FactStatus = 'proposed' | 'accepted' | 'edited' | 'rejected'
export type Translation = 'done' | 'translating' | 'not-translated'
export type Statement = { readonly en: string; readonly fr: string }
/** A theme section of the interview guide; null is "Other". */
export type Theme = { readonly id: string; readonly title: string } | null

/** Context map Fact (Evidence): a neutral statement supported by verbatims of one interview. */
export type Fact = {
  readonly id: string
  readonly sessionId: string
  readonly studyId: string
  readonly statement: Statement
  readonly translation: Translation
  readonly polarity: Polarity
  readonly theme: Theme
  readonly verbatimIds: readonly string[]
  readonly origin: 'ai' | 'person'
  readonly status: FactStatus
  readonly runId: string | null
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
}

export type FactError =
  | 'FACT_NEEDS_VERBATIM'
  | 'NAME_IN_STATEMENT'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'

const validStatement = (s: string) => s.trim().length >= 1 && s.trim().length <= STATEMENT_MAX

export type CheckedFact = {
  readonly statement: Statement
  readonly polarity: Polarity
  readonly theme: Theme
  readonly verbatimIds: string[]
}

/**
 * FR-006, research R6: the facts of an answer the app keeps. Unknown verbatim ids are dropped; a
 * fact left without verbatim, with a theme not sent, a statement empty or too long, or holding a
 * known name or a placeholder is dropped and counted.
 */
export const checkFacts = (
  answer: readonly {
    statement: { en: string; fr: string }
    polarity: Polarity
    theme: string
    verbatims: readonly string[]
  }[],
  ids: ReadonlyMap<string, string>,
  themes: ReadonlyMap<string, Theme>,
  names: readonly string[],
): { kept: CheckedFact[]; leftOut: number } => {
  const kept: CheckedFact[] = []
  let leftOut = 0
  for (const a of answer) {
    const verbatimIds = [
      ...new Set(a.verbatims.map((v) => ids.get(v)).filter((v): v is string => v !== undefined)),
    ]
    const statement = { en: a.statement.en.trim(), fr: a.statement.fr.trim() }
    if (
      verbatimIds.length === 0 ||
      !themes.has(a.theme) ||
      !validStatement(statement.en) ||
      !validStatement(statement.fr) ||
      holdsName(statement.en, names) ||
      holdsName(statement.fr, names)
    ) {
      leftOut++
      continue
    }
    kept.push({ statement, polarity: a.polarity, theme: themes.get(a.theme) ?? null, verbatimIds })
  }
  return { kept, leftOut }
}

/**
 * Research R7, constitution IV: a fact the AI proposes again — its verbatims are all those of a
 * decided fact, or its statement shares 60% of its words with one (in either language).
 */
export const isReproposal = (
  candidate: { readonly statement: Statement; readonly verbatimIds: readonly string[] },
  decided: readonly { readonly statement: Statement; readonly verbatimIds: readonly string[] }[],
): boolean =>
  decided.some(
    (d) =>
      candidate.verbatimIds.every((v) => d.verbatimIds.includes(v)) ||
      sharedWords(candidate.statement.en, d.statement.en) >= SAME_WORDS ||
      sharedWords(candidate.statement.fr, d.statement.fr) >= SAME_WORDS,
  )

/**
 * Within one reading: a fact the AI already proposed in other words (60% of its words, in either
 * language). Sharing a verbatim is not enough: one rich quote can back several facts.
 */
export const isRepeated = (
  candidate: { readonly statement: Statement },
  proposed: readonly { readonly statement: Statement }[],
): boolean =>
  proposed.some(
    (p) =>
      sharedWords(candidate.statement.en, p.statement.en) >= SAME_WORDS ||
      sharedWords(candidate.statement.fr, p.statement.fr) >= SAME_WORDS,
  )

/** A person's statement: one language or both; the missing one is translated (research R9). */
type GivenStatement = { readonly en?: string | undefined; readonly fr?: string | undefined }

const statementOf = (
  given: GivenStatement,
  current: Statement,
  names: readonly string[],
): Result<{ statement: Statement; translation: Translation | null }, FactError> => {
  const en = given.en?.trim()
  const fr = given.fr?.trim()
  for (const s of [en, fr])
    if (s !== undefined && (!validStatement(s) || holdsName(s, names)))
      return err(validStatement(s) ? 'NAME_IN_STATEMENT' : 'VALIDATION')
  const statement = { en: en ?? current.en, fr: fr ?? current.fr }
  // One language written: the other is translated behind; both, or none: nothing to translate.
  const translation = (en === undefined) !== (fr === undefined) ? 'translating' : null
  return ok({ statement, translation })
}

/** FR-009: a fact a person writes is accepted at once. */
export const createFact = (input: {
  readonly id: string
  readonly sessionId: string
  readonly studyId: string
  readonly statement: GivenStatement
  readonly polarity: Polarity
  readonly theme: Theme
  readonly verbatimIds: readonly string[]
  readonly by: string
  readonly now: Date
  readonly names: readonly string[]
}): Result<Fact, FactError> => {
  if (input.verbatimIds.length === 0) return err('FACT_NEEDS_VERBATIM')
  if (input.statement.en === undefined && input.statement.fr === undefined) return err('VALIDATION')
  const made = statementOf(input.statement, { en: '', fr: '' }, input.names)
  if (!made.ok) return made
  return ok({
    id: input.id,
    sessionId: input.sessionId,
    studyId: input.studyId,
    statement: made.value.statement,
    translation: made.value.translation ?? 'done',
    polarity: input.polarity,
    theme: input.theme,
    verbatimIds: [...new Set(input.verbatimIds)],
    origin: 'person',
    status: 'accepted',
    runId: null,
    decidedBy: input.by,
    decidedAt: input.now,
    version: 1,
  })
}

export type FactDecision = {
  readonly decision: 'accept' | 'reject' | 'edit'
  readonly version: number
  readonly statement?: GivenStatement | undefined
  readonly polarity?: Polarity | undefined
  readonly theme?: Theme | undefined
  readonly verbatimIds?: readonly string[] | undefined
}

/** FR-009: accept, reject or edit, with the version the person saw. */
/**
 * A person adds a verbatim to a fact: more support, not a decision. The fact keeps its status
 * (a proposed one stays to decide) and its version moves on.
 */
export const attachVerbatim = (
  fact: Fact,
  verbatimId: string,
  version: number,
): Result<Fact, 'VERSION_CONFLICT'> => {
  if (version !== fact.version) return err('VERSION_CONFLICT')
  return ok({
    ...fact,
    verbatimIds: [...new Set([...fact.verbatimIds, verbatimId])],
    version: fact.version + 1,
  })
}

export const decideFact = (
  fact: Fact,
  d: FactDecision,
  by: string,
  now: Date,
  names: readonly string[],
): Result<Fact, FactError> => {
  if (d.version !== fact.version) return err('VERSION_CONFLICT')
  const decided = { decidedBy: by, decidedAt: now, version: fact.version + 1 }
  if (d.decision !== 'edit')
    return ok({ ...fact, ...decided, status: d.decision === 'accept' ? 'accepted' : 'rejected' })
  if (d.verbatimIds && d.verbatimIds.length === 0) return err('FACT_NEEDS_VERBATIM')
  const made = statementOf(d.statement ?? {}, fact.statement, names)
  if (!made.ok) return made
  return ok({
    ...fact,
    ...decided,
    status: 'edited',
    statement: made.value.statement,
    translation: made.value.translation ?? fact.translation,
    polarity: d.polarity ?? fact.polarity,
    theme: d.theme === undefined ? fact.theme : d.theme,
    verbatimIds: d.verbatimIds ? [...new Set(d.verbatimIds)] : fact.verbatimIds,
  })
}
