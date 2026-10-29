import { err, holdsName, ok, type Result } from '@goodresearch/shared'
import {
  type Bilingual,
  DESCRIPTION_MAX,
  type FactNow,
  type Insight,
  type Link,
  NOTE_MAX,
  type ProjectTheme,
  STATEMENT_MAX,
  snapshotOf,
} from './insights.ts'
import { counts, linkState } from './links.ts'

export type InsightError =
  | 'INSIGHT_NEEDS_SUPPORT'
  | 'FACT_NOT_ACCEPTED'
  | 'NAME_IN_STATEMENT'
  | 'VALIDATION'

/** What a person's decision is checked against: the facts now, the project's studies, the names. */
export type DecisionContext = {
  readonly facts: ReadonlyMap<string, FactNow>
  readonly studies: ReadonlySet<string>
  readonly names: readonly string[]
  readonly by: string
  readonly at: Date
}

const supported = (links: readonly Link[], c: DecisionContext) =>
  links.some(
    (l) =>
      l.role === 'support' &&
      l.state === 'counted' &&
      counts(linkState(l, c.facts.get(l.factId), c.studies)),
  )

/** A fact a person may link: of the project and not rejected; one still to decide counts once accepted. */
const acceptedFact = (factId: string, c: DecisionContext): FactNow | null => {
  const fact = c.facts.get(factId)
  return fact && c.studies.has(fact.studyId) && fact.status !== 'rejected' ? fact : null
}

/** A person's decision on the insight: who, when, a new version. */
const decided = (i: Insight, c: DecisionContext, change: Partial<Insight>): Insight => ({
  ...i,
  ...change,
  decidedBy: c.by,
  decidedAt: c.at,
  version: i.version + 1,
})

/** The counted links' facts as they are now: a person who decides has seen them (research R7). */
const reviewed = (links: readonly Link[], c: DecisionContext): Link[] =>
  links.map((l) => {
    const fact = c.facts.get(l.factId)
    return l.state === 'counted' && fact ? { ...l, snapshot: snapshotOf(fact) } : l
  })

/** FR-010: validate needs a counted support to an accepted fact of the project; reject does not. */
export const decide = (
  i: Insight,
  decision: 'validate' | 'reject',
  c: DecisionContext,
): Result<Insight, InsightError> => {
  if (decision === 'reject') return ok(decided(i, c, { status: 'rejected' }))
  if (!supported(i.links, c)) return err('INSIGHT_NEEDS_SUPPORT')
  return ok(decided(i, c, { status: i.status === 'edited' ? 'edited' : 'validated' }))
}

export type InsightTexts = {
  readonly theme?: ProjectTheme | undefined
  readonly statement?: Bilingual | undefined
  readonly description?: Bilingual | undefined
  readonly counterEvidence?: Bilingual | undefined
  readonly minorityView?: Bilingual | undefined
}

const within = (b: Bilingual | undefined, min: number, max: number) =>
  !b || [b.en, b.fr].every((s) => s.trim().length >= min && s.trim().length <= max)

/** A statement written in one language: the other is empty until its translation comes. */
const statementFits = (b: Bilingual | undefined) =>
  !b || (within(b, 0, STATEMENT_MAX) && (b.en.trim().length > 0 || b.fr.trim().length > 0))

const checkTexts = (t: InsightTexts, c: DecisionContext): InsightError | null => {
  if (
    !statementFits(t.statement) ||
    !within(t.description, 0, DESCRIPTION_MAX) ||
    !within(t.counterEvidence, 0, NOTE_MAX) ||
    !within(t.minorityView, 0, NOTE_MAX)
  )
    return 'VALIDATION'
  if (t.statement && (holdsName(t.statement.en, c.names) || holdsName(t.statement.fr, c.names)))
    return 'NAME_IN_STATEMENT'
  return null
}

const defined = (t: InsightTexts): Partial<Insight> =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined))

/** FR-010: a person's edit makes the insight theirs ("edited") and reviews its facts. */
export const editInsight = (
  i: Insight,
  texts: InsightTexts,
  c: DecisionContext,
): Result<Insight, InsightError> => {
  const problem = checkTexts(texts, c)
  if (problem) return err(problem)
  if (!supported(i.links, c)) return err('INSIGHT_NEEDS_SUPPORT')
  return ok(decided(i, c, { ...defined(texts), status: 'edited', links: reviewed(i.links, c) }))
}

const personLink = (fact: FactNow, role: Link['role'], c: DecisionContext): Link => ({
  factId: fact.id,
  role,
  state: 'counted',
  origin: 'person',
  snapshot: snapshotOf(fact),
  by: c.by,
  at: c.at,
})

/** FR-010: an insight a person writes is validated at once, with at least one supporting fact. */
export const createInsight = (
  input: {
    readonly id: string
    readonly projectId: string
    readonly theme: ProjectTheme
    readonly statement: Bilingual
    readonly description?: Bilingual | undefined
    readonly counterEvidence?: Bilingual | undefined
    readonly minorityView?: Bilingual | undefined
    readonly translation?: Insight['translation']
    readonly support: readonly string[]
    readonly counter: readonly string[]
  },
  c: DecisionContext,
): Result<Insight, InsightError> => {
  const problem = checkTexts(input, c)
  if (problem) return err(problem)
  const links: Link[] = []
  for (const [ids, role] of [
    [input.support, 'support'],
    [input.counter.filter((id) => !input.support.includes(id)), 'counter'],
  ] as const)
    for (const id of new Set(ids)) {
      const fact = acceptedFact(id, c)
      if (!fact) return err('FACT_NOT_ACCEPTED')
      links.push(personLink(fact, role, c))
    }
  if (!supported(links, c)) return err('INSIGHT_NEEDS_SUPPORT')
  const empty = { en: '', fr: '' }
  return ok({
    id: input.id,
    projectId: input.projectId,
    theme: input.theme,
    statement: input.statement,
    description: input.description ?? empty,
    counterEvidence: input.counterEvidence ?? empty,
    minorityView: input.minorityView ?? empty,
    translation: input.translation ?? 'done',
    origin: 'person',
    status: 'validated',
    runId: null,
    decidedBy: c.by,
    decidedAt: c.at,
    version: 1,
    links,
  })
}

/** FR-010: links a fact as support or counter (one role per fact), or accepts a suggested one. */
export const linkFact = (
  i: Insight,
  factId: string,
  role: Link['role'],
  c: DecisionContext,
): Result<Insight, InsightError> => {
  const fact = acceptedFact(factId, c)
  if (!fact) return err('FACT_NOT_ACCEPTED')
  const link = personLink(fact, role, c)
  const links = i.links.some((l) => l.factId === factId)
    ? i.links.map((l) => (l.factId === factId ? link : l))
    : [...i.links, link]
  if (i.status !== 'proposed' && i.status !== 'rejected' && !supported(links, c))
    return err('INSIGHT_NEEDS_SUPPORT')
  return ok({ ...i, links, version: i.version + 1 })
}

/**
 * FR-010, constitution IV: unlinks a fact, or dismisses a suggested one. The link stays as
 * `unlinked` so no run links it again; a decided insight keeps at least one supporting fact.
 */
export const unlinkFact = (
  i: Insight,
  factId: string,
  c: DecisionContext,
): Result<Insight, InsightError> => {
  const links = i.links.map((l) =>
    l.factId === factId ? { ...l, state: 'unlinked' as const, by: c.by, at: c.at } : l,
  )
  if ((i.status === 'validated' || i.status === 'edited') && !supported(links, c))
    return err('INSIGHT_NEEDS_SUPPORT')
  return ok({ ...i, links, version: i.version + 1 })
}

/** FR-012: "Reviewed" takes the counted facts as they are now; nothing else changes. */
export const markReviewed = (i: Insight, c: DecisionContext): Result<Insight, InsightError> =>
  ok({ ...i, links: reviewed(i.links, c), version: i.version + 1 })
