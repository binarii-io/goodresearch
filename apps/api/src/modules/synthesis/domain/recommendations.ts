import { err, holdsName, ok, type Result, sharedWords } from '@goodresearch/shared'
import type { Bilingual, InsightStatus, PendingTranslation, Translation } from './insights.ts'

export type Level = 'high' | 'medium' | 'low'
export type Kind = 'build' | 'test' | 'investigate'
export type Rating = 'high' | 'medium' | 'low'
export const KINDS: readonly Kind[] = ['build', 'test', 'investigate']
export const RATINGS: readonly Rating[] = ['high', 'medium', 'low']

/** An insight as a recommendation sees it now: its status and computed confidence (spec 013). */
export type InsightNow = {
  readonly id: string
  readonly status: InsightStatus
  readonly statementEn: string
  readonly themeKey: string
  readonly level: Level
  readonly version: number
}

/** The insight as it was when linked or last reviewed (research R3). */
export type RecSnapshot = {
  readonly statementEn: string
  readonly themeKey: string
  readonly level: Level
}

export type RecLink = {
  readonly insightId: string
  /** `suggested`: added by a run to a decided recommendation, counted once a person accepts it. */
  readonly state: 'counted' | 'suggested' | 'unlinked'
  readonly origin: 'ai' | 'person'
  readonly snapshot: RecSnapshot
  readonly by: string
  readonly at: Date
}

/** Context map Recommendation (Synthesis): what the team should do, resting on insights. */
export type Recommendation = {
  readonly id: string
  readonly projectId: string
  readonly action: Bilingual
  readonly rationale: Bilingual
  readonly successMeasure: Bilingual
  readonly kind: Kind
  readonly impact: Rating
  readonly effort: Rating
  /** Free text (a role, a team); never sent to the AI. */
  readonly owner: string | null
  readonly translation: Translation
  readonly pendingTranslation?: PendingTranslation | null | undefined
  readonly origin: 'ai' | 'person'
  readonly status: InsightStatus
  readonly runId: string | null
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
  readonly links: readonly RecLink[]
}

export type RecField = 'action' | 'rationale' | 'successMeasure'
export const REC_MAX: Record<RecField, number> = {
  action: 200,
  rationale: 1000,
  successMeasure: 300,
}
export const OWNER_MAX = 100
/** FR-004: at most this many new recommendations per run. */
export const NEW_RECOMMENDATIONS = 15
const SAME_WORDS = 0.6

const VALUE: Record<Rating, number> = { high: 3, medium: 2, low: 1 }

/** FR-006: impact × 2 − effort (high 3, medium 2, low 1). */
export const priority = (impact: Rating, effort: Rating): number =>
  VALUE[impact] * 2 - VALUE[effort]

export const snapshotOfInsight = (i: InsightNow): RecSnapshot => ({
  statementEn: i.statementEn,
  themeKey: i.themeKey,
  level: i.level,
})

export type RecLinkState = 'validated' | 'to-decide' | 'rejected' | 'deleted' | 'changed'

/** Research R3: a linked insight now, against the snapshot the link keeps. */
export const linkStateOf = (link: RecLink, insight: InsightNow | undefined): RecLinkState => {
  if (!insight) return 'deleted'
  if (insight.status === 'rejected') return 'rejected'
  if (insight.status === 'proposed') return 'to-decide'
  const s = link.snapshot
  return s.statementEn !== insight.statementEn ||
    s.themeKey !== insight.themeKey ||
    s.level !== insight.level
    ? 'changed'
    : 'validated'
}

const counts = (state: RecLinkState) => state === 'validated' || state === 'changed'

const countedInsights = (links: readonly RecLink[], insights: ReadonlyMap<string, InsightNow>) =>
  links.flatMap((l) => {
    const i = insights.get(l.insightId)
    return l.state === 'counted' && i && counts(linkStateOf(l, i)) ? [i] : []
  })

/** FR-006: a build whose counted insights are all of low confidence is shown as a test. */
export const kindShown = (
  r: Pick<Recommendation, 'kind' | 'links'>,
  insights: ReadonlyMap<string, InsightNow>,
): { kind: Kind; downgraded: boolean } => {
  const counted = countedInsights(r.links, insights)
  const downgraded =
    r.kind === 'build' && counted.length > 0 && counted.every((i) => i.level === 'low')
  return { kind: downgraded ? 'test' : r.kind, downgraded }
}

/** FR-009: the counted links whose insight was rejected, deleted or changed since. */
export const insightsChanged = (
  links: readonly RecLink[],
  insights: ReadonlyMap<string, InsightNow>,
): number =>
  links.filter((l) => {
    if (l.state !== 'counted') return false
    const state = linkStateOf(l, insights.get(l.insightId))
    return state === 'rejected' || state === 'deleted' || state === 'changed'
  }).length

/** The AI's answer for one recommendation (research R2); `ref` names one to update. */
export type RecommendationAnswer = {
  readonly ref?: string | undefined
  readonly action: Bilingual
  readonly rationale: Bilingual
  readonly kind: Kind
  readonly impact: Rating
  readonly effort: Rating
  readonly successMeasure: Bilingual
  readonly insights: readonly string[]
}

export type CheckedRecommendation = Omit<RecommendationAnswer, 'insights'> & {
  /** Insight ids. */
  readonly insights: readonly string[]
}

const both = (b: Bilingual, f: (s: string) => string): Bilingual => ({ en: f(b.en), fr: f(b.fr) })
const fits = (b: Bilingual, min: number, max: number) =>
  [b.en, b.fr].every((s) => s.length >= min && s.length <= max)

/**
 * FR-004: the recommendations of an answer the app keeps: known insight refs only, at least one,
 * values within their lists, texts within their lengths, no known name in the action; at most 15
 * new ones (updates are not capped).
 */
export const checkRecommendations = (
  answer: readonly RecommendationAnswer[],
  refs: ReadonlyMap<string, string>,
  names: readonly string[],
): { kept: CheckedRecommendation[]; leftOut: number } => {
  const kept: CheckedRecommendation[] = []
  let leftOut = 0
  for (const a of answer) {
    const insights = [
      ...new Set(a.insights.map((r) => refs.get(r)).filter((id): id is string => id !== undefined)),
    ]
    const action = both(a.action, (s) => s.trim())
    const rationale = both(a.rationale, (s) => s.trim())
    const successMeasure = both(a.successMeasure, (s) => s.trim())
    if (
      insights.length === 0 ||
      !KINDS.includes(a.kind) ||
      !RATINGS.includes(a.impact) ||
      !RATINGS.includes(a.effort) ||
      !fits(action, 1, REC_MAX.action) ||
      !fits(rationale, 0, REC_MAX.rationale) ||
      !fits(successMeasure, 0, REC_MAX.successMeasure) ||
      holdsName(action.en, names) ||
      holdsName(action.fr, names)
    ) {
      leftOut++
      continue
    }
    kept.push({ ...a, action, rationale, successMeasure, insights })
  }
  const updates = kept.filter((k) => k.ref !== undefined)
  const created = kept.filter((k) => k.ref === undefined)
  return {
    kept: [...created.slice(0, NEW_RECOMMENDATIONS), ...updates],
    leftOut: leftOut + Math.max(0, created.length - NEW_RECOMMENDATIONS),
  }
}

const sameWords = (a: Bilingual, b: Bilingual) =>
  sharedWords(a.en, b.en) >= SAME_WORDS || sharedWords(a.fr, b.fr) >= SAME_WORDS
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

/** FR-005, constitution IV: 60% of the words of a rejected action, or exactly its insights. */
export const isRecommendationReproposal = (
  candidate: { readonly action: Bilingual; readonly insights: readonly string[] },
  rejected: readonly { readonly action: Bilingual; readonly insights: readonly string[] }[],
): boolean =>
  rejected.some(
    (r) => sameWords(candidate.action, r.action) || sameSet(candidate.insights, r.insights),
  )

const insightsOf = (r: Recommendation) =>
  r.links.filter((l) => l.state !== 'unlinked').map((l) => l.insightId)

/**
 * FR-005: a run's checked answer merged into the project's recommendations, as insights are
 * (spec 013 research R5). `ref` is already the recommendation's id.
 */
export const mergeRecommendations = (
  existing: readonly Recommendation[],
  checked: readonly CheckedRecommendation[],
  projectId: string,
  run: {
    readonly runId: string
    readonly at: Date
    readonly insights: ReadonlyMap<string, InsightNow>
    readonly newId: () => string
  },
): { creates: Recommendation[]; updates: Recommendation[]; leftOut: number } => {
  const byId = new Map(existing.map((r) => [r.id, r]))
  const rejected = existing
    .filter((r) => r.status === 'rejected')
    .map((r) => ({ action: r.action, insights: insightsOf(r) }))
  const live = existing.filter((r) => r.status !== 'rejected').map((r) => r.action)
  const creates: Recommendation[] = []
  const updates = new Map<string, Recommendation>()
  let leftOut = 0
  const linksOf = (ids: readonly string[], skip: ReadonlySet<string>, state: RecLink['state']) =>
    ids.flatMap((insightId): RecLink[] => {
      const i = run.insights.get(insightId)
      return i && !skip.has(insightId)
        ? [{ insightId, state, origin: 'ai', snapshot: snapshotOfInsight(i), by: 'ai', at: run.at }]
        : []
    })
  for (const c of checked) {
    const texts = {
      action: c.action,
      rationale: c.rationale,
      successMeasure: c.successMeasure,
      kind: c.kind,
      impact: c.impact,
      effort: c.effort,
    }
    if (c.ref !== undefined) {
      const current = updates.get(c.ref) ?? byId.get(c.ref)
      if (!current || current.status === 'rejected') {
        if (!current) leftOut++
        continue
      }
      // A person's edit is protected even when it stays proposed (review of PR #14).
      if (current.status === 'proposed' && current.decidedBy === null) {
        const kept = current.links.filter((l) => l.origin === 'person' || l.state === 'unlinked')
        const links = [
          ...kept,
          ...linksOf(c.insights, new Set(kept.map((l) => l.insightId)), 'counted'),
        ]
        updates.set(current.id, {
          ...current,
          ...texts,
          translation: 'done',
          runId: run.runId,
          version: current.version + 1,
          links,
        })
      } else {
        const added = linksOf(
          c.insights,
          new Set(current.links.map((l) => l.insightId)),
          'suggested',
        )
        if (added.length > 0)
          updates.set(current.id, {
            ...current,
            version: current.version + 1,
            links: [...current.links, ...added],
          })
      }
      continue
    }
    const repeated = [...live, ...creates.map((r) => r.action)].some((a) => sameWords(c.action, a))
    const links = linksOf(c.insights, new Set(), 'counted')
    if (repeated || isRecommendationReproposal(c, rejected) || links.length === 0) {
      leftOut++
      continue
    }
    creates.push({
      id: run.newId(),
      projectId,
      ...texts,
      owner: null,
      translation: 'done',
      origin: 'ai',
      status: 'proposed',
      runId: run.runId,
      decidedBy: null,
      decidedAt: null,
      version: 1,
      links,
    })
  }
  return { creates, updates: [...updates.values()], leftOut }
}

export type RecommendationError =
  | 'RECOMMENDATION_NEEDS_INSIGHT'
  | 'INSIGHT_NOT_VALIDATED'
  | 'NAME_IN_STATEMENT'
  | 'VALIDATION'

export type RecContext = {
  readonly insights: ReadonlyMap<string, InsightNow>
  readonly names: readonly string[]
  readonly by: string
  readonly at: Date
}

const supported = (links: readonly RecLink[], c: RecContext) =>
  countedInsights(links, c.insights).length > 0

const decided = (r: Recommendation, c: RecContext, change: Partial<Recommendation>) => ({
  ...r,
  ...change,
  decidedBy: c.by,
  decidedAt: c.at,
  version: r.version + 1,
})

const reviewed = (links: readonly RecLink[], c: RecContext): RecLink[] =>
  links.map((l) => {
    const i = c.insights.get(l.insightId)
    return l.state === 'counted' && i ? { ...l, snapshot: snapshotOfInsight(i) } : l
  })

/** FR-007: validate needs a counted validated insight; reject does not. */
export const decideRecommendation = (
  r: Recommendation,
  decision: 'validate' | 'reject',
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  if (decision === 'reject') return ok(decided(r, c, { status: 'rejected' }))
  if (!supported(r.links, c)) return err('RECOMMENDATION_NEEDS_INSIGHT')
  return ok(decided(r, c, { status: r.status === 'edited' ? 'edited' : 'validated' }))
}

export type RecChanges = {
  readonly action?: Bilingual | undefined
  readonly rationale?: Bilingual | undefined
  readonly successMeasure?: Bilingual | undefined
  readonly kind?: Kind | undefined
  readonly impact?: Rating | undefined
  readonly effort?: Rating | undefined
  readonly owner?: string | null | undefined
}

const within = (b: Bilingual | undefined, max: number) =>
  !b || [b.en, b.fr].every((s) => s.trim().length <= max)

const checkChanges = (t: RecChanges, c: RecContext): RecommendationError | null => {
  if (
    (t.action && !(t.action.en.trim() || t.action.fr.trim())) ||
    !within(t.action, REC_MAX.action) ||
    !within(t.rationale, REC_MAX.rationale) ||
    !within(t.successMeasure, REC_MAX.successMeasure) ||
    (t.owner && t.owner.length > OWNER_MAX) ||
    (t.kind && !KINDS.includes(t.kind)) ||
    (t.impact && !RATINGS.includes(t.impact)) ||
    (t.effort && !RATINGS.includes(t.effort))
  )
    return 'VALIDATION'
  if (t.action && (holdsName(t.action.en, c.names) || holdsName(t.action.fr, c.names)))
    return 'NAME_IN_STATEMENT'
  return null
}

const defined = (t: RecChanges): Partial<Recommendation> =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined))

/** FR-007: a person's edit in place makes it theirs ("edited") and reviews its insights. */
export const editRecommendation = (
  r: Recommendation,
  changes: RecChanges,
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  const problem = checkChanges(changes, c)
  if (problem) return err(problem)
  // An edit is no validation (review of PR #14): it becomes "edited" only when it rests on a
  // validated insight; a proposed one otherwise stays proposed, a rejected one rejected.
  const status = r.status === 'rejected' ? 'rejected' : supported(r.links, c) ? 'edited' : r.status
  return ok(decided(r, c, { ...defined(changes), status, links: reviewed(r.links, c) }))
}

/** An insight a person may link: of the project and not rejected (one to decide counts once validated). */
const linkable = (insightId: string, c: RecContext) => {
  const i = c.insights.get(insightId)
  return i && i.status !== 'rejected' ? i : null
}

const personLink = (i: InsightNow, c: RecContext): RecLink => ({
  insightId: i.id,
  state: 'counted',
  origin: 'person',
  snapshot: snapshotOfInsight(i),
  by: c.by,
  at: c.at,
})

/** FR-007: a recommendation written by hand, validated, with at least one validated insight. */
export const createRecommendation = (
  input: {
    readonly id: string
    readonly projectId: string
    readonly action: Bilingual
    readonly rationale?: Bilingual | undefined
    readonly successMeasure?: Bilingual | undefined
    readonly kind: Kind
    readonly impact: Rating
    readonly effort: Rating
    readonly owner?: string | null | undefined
    readonly translation?: Translation | undefined
    readonly insights: readonly string[]
  },
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  const problem = checkChanges(input, c)
  if (problem) return err(problem)
  const links: RecLink[] = []
  for (const id of new Set(input.insights)) {
    const i = linkable(id, c)
    if (!i) return err('INSIGHT_NOT_VALIDATED')
    links.push(personLink(i, c))
  }
  if (!supported(links, c)) return err('RECOMMENDATION_NEEDS_INSIGHT')
  const empty = { en: '', fr: '' }
  return ok({
    id: input.id,
    projectId: input.projectId,
    action: input.action,
    rationale: input.rationale ?? empty,
    successMeasure: input.successMeasure ?? empty,
    kind: input.kind,
    impact: input.impact,
    effort: input.effort,
    owner: input.owner ?? null,
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

/** FR-007: links an insight, or accepts a suggested one. */
export const linkInsight = (
  r: Recommendation,
  insightId: string,
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  const i = linkable(insightId, c)
  if (!i) return err('INSIGHT_NOT_VALIDATED')
  const link = personLink(i, c)
  const links = r.links.some((l) => l.insightId === insightId)
    ? r.links.map((l) => (l.insightId === insightId ? link : l))
    : [...r.links, link]
  return ok({ ...r, links, version: r.version + 1 })
}

/** FR-007: unlinks an insight (kept as `unlinked`); a decided one keeps a validated insight. */
export const unlinkInsight = (
  r: Recommendation,
  insightId: string,
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  const links = r.links.map((l) =>
    l.insightId === insightId ? { ...l, state: 'unlinked' as const, by: c.by, at: c.at } : l,
  )
  if ((r.status === 'validated' || r.status === 'edited') && !supported(links, c))
    return err('RECOMMENDATION_NEEDS_INSIGHT')
  return ok({ ...r, links, version: r.version + 1 })
}

/** FR-009: "Reviewed" takes the linked insights as they are now. */
export const markRecommendationReviewed = (
  r: Recommendation,
  c: RecContext,
): Result<Recommendation, RecommendationError> => {
  // A rejected or deleted insight is let go of: seen, it no longer flags the recommendation; but a
  // decided one is never left without a validated insight (the person unlinks or rejects instead).
  const fresh = reviewed(r.links, c)
  const letGo = fresh.map((l) => {
    const state = l.state === 'counted' ? linkStateOf(l, c.insights.get(l.insightId)) : null
    return state === 'rejected' || state === 'deleted'
      ? { ...l, state: 'unlinked' as const, by: c.by, at: c.at }
      : l
  })
  const decidedOne = r.status === 'validated' || r.status === 'edited'
  const links = decidedOne && !supported(letGo, c) ? fresh : letGo
  return ok({ ...r, links, version: r.version + 1 })
}
