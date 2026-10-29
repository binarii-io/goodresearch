import { holdsName, sharedWords } from '@goodresearch/shared'

export type Bilingual = { readonly en: string; readonly fr: string }
export type FactPolarity = 'positive' | 'negative' | 'neutral'
export type InsightStatus = 'proposed' | 'validated' | 'edited' | 'rejected'
export type Translation = 'done' | 'translating' | 'not-translated'
/** A theme of the project: a guide theme section's folded title, or `other` (research R2). */
export type ProjectTheme = { readonly key: string; readonly title: string | null }
export const OTHER: ProjectTheme = { key: 'other', title: null }

/** A fact as Synthesis sees it now (Evidence's `projectFacts` / `factsByIds`). */
export type FactNow = {
  readonly id: string
  readonly studyId: string
  readonly status: 'proposed' | 'accepted' | 'edited' | 'rejected'
  readonly participants: readonly string[]
  readonly polarity: FactPolarity
  readonly theme: { readonly id: string; readonly title: string } | null
  readonly statement: Bilingual
  readonly version: number
}

/** The fact as it was when linked or last reviewed (research R7). */
export type Snapshot = {
  readonly version: number
  readonly polarity: FactPolarity
  readonly themeId: string | null
  readonly statementEn: string
}

export type Link = {
  readonly factId: string
  readonly role: 'support' | 'counter'
  /** `suggested`: added by a run to a decided insight, counted once a person accepts it. */
  readonly state: 'counted' | 'suggested' | 'unlinked'
  readonly origin: 'ai' | 'person'
  readonly snapshot: Snapshot
  readonly by: string
  readonly at: Date
}

/** Context map Insight (Synthesis): a project-level finding over accepted facts. */
export type Insight = {
  readonly id: string
  readonly projectId: string
  readonly theme: ProjectTheme
  readonly statement: Bilingual
  readonly description: Bilingual
  readonly counterEvidence: Bilingual
  readonly minorityView: Bilingual
  readonly translation: Translation
  readonly origin: 'ai' | 'person'
  readonly status: InsightStatus
  readonly runId: string | null
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
  readonly links: readonly Link[]
  /**
   * The fields a person wrote in one language, still to translate into the other: what "Translate
   * again" sends after a failure (review of PR #13).
   */
  readonly pendingTranslation?: PendingTranslation | null | undefined
}

export type InsightField = 'statement' | 'description' | 'counterEvidence' | 'minorityView'
export type PendingTranslation = {
  readonly from: 'en' | 'fr'
  readonly fields: readonly InsightField[]
}

/** The longest text of each field (FR-005). */
export const FIELD_MAX: Record<InsightField, number> = {
  statement: 200,
  description: 1000,
  counterEvidence: 500,
  minorityView: 500,
}

export const snapshotOf = (f: FactNow): Snapshot => ({
  version: f.version,
  polarity: f.polarity,
  themeId: f.theme?.id ?? null,
  statementEn: f.statement.en,
})

export const STATEMENT_MAX = 200
export const DESCRIPTION_MAX = 1000
export const NOTE_MAX = 500
/** FR-005: at most this many new insights per run. */
export const NEW_PER_RUN = 25
const SAME_WORDS = 0.6

const PERCENT = /\d+(?:[.,]\d+)?\s?%|\bper ?cent\b|\bpour ?cent\b|\bpercent\b/i

/** Research R8: the sentences giving a percentage go; the app computes the shares. */
export const removePercentages = (text: string): string =>
  text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !PERCENT.test(sentence))
    .join(' ')
    .trim()

/** The AI's answer for one insight (research R2); `ref` names an existing insight to update. */
export type InsightAnswer = {
  readonly ref?: string | undefined
  readonly theme: string
  readonly statement: Bilingual
  readonly description: Bilingual
  readonly counterEvidence: Bilingual
  readonly minorityView: Bilingual
  readonly support: readonly string[]
  readonly counter: readonly string[]
}

export type CheckedInsight = {
  readonly ref?: string | undefined
  readonly theme: ProjectTheme
  readonly statement: Bilingual
  readonly description: Bilingual
  readonly counterEvidence: Bilingual
  readonly minorityView: Bilingual
  /** Fact ids. */
  readonly support: readonly string[]
  readonly counter: readonly string[]
}

const both = (b: Bilingual, f: (s: string) => string): Bilingual => ({ en: f(b.en), fr: f(b.fr) })
const fits = (b: Bilingual, min: number, max: number) =>
  [b.en, b.fr].every((s) => s.length >= min && s.length <= max)

/**
 * FR-005, research R8: the insights of an answer the app keeps. Unknown fact refs are dropped; an
 * insight left without support, with a theme not sent, or a statement empty, too long, holding a
 * known name or a percentage is dropped and counted. At most 25 new ones are kept, those
 * supported by the most participants first; updates of existing insights are not capped.
 */
export const checkInsights = (
  answer: readonly InsightAnswer[],
  refs: ReadonlyMap<string, string>,
  themes: ReadonlyMap<string, ProjectTheme>,
  names: readonly string[],
  participants: ReadonlyMap<string, readonly string[]>,
): { kept: CheckedInsight[]; leftOut: number } => {
  const kept: CheckedInsight[] = []
  let leftOut = 0
  const known = (list: readonly string[]) => [
    ...new Set(list.map((r) => refs.get(r)).filter((id): id is string => id !== undefined)),
  ]
  for (const a of answer) {
    const support = known(a.support)
    const counter = known(a.counter).filter((id) => !support.includes(id))
    const statement = both(a.statement, (s) => s.trim())
    const theme = themes.get(a.theme)
    const texts = {
      description: both(a.description, (s) => removePercentages(s.trim())),
      counterEvidence: both(a.counterEvidence, (s) => removePercentages(s.trim())),
      minorityView: both(a.minorityView, (s) => removePercentages(s.trim())),
    }
    if (
      support.length === 0 ||
      !theme ||
      !fits(statement, 1, STATEMENT_MAX) ||
      !fits(texts.description, 0, DESCRIPTION_MAX) ||
      !fits(texts.counterEvidence, 0, NOTE_MAX) ||
      !fits(texts.minorityView, 0, NOTE_MAX) ||
      PERCENT.test(statement.en) ||
      PERCENT.test(statement.fr) ||
      holdsName(statement.en, names) ||
      holdsName(statement.fr, names)
    ) {
      leftOut++
      continue
    }
    kept.push({ ref: a.ref, theme, statement, ...texts, support, counter })
  }
  const reach = (i: CheckedInsight) =>
    new Set(i.support.flatMap((id) => participants.get(id) ?? [])).size
  const updates = kept.filter((i) => i.ref !== undefined)
  const created = kept
    .filter((i) => i.ref === undefined)
    .map((i, n) => ({ i, n, reach: reach(i) }))
    .sort((a, b) => b.reach - a.reach || a.n - b.n)
    .map((x) => x.i)
  return {
    kept: [...created.slice(0, NEW_PER_RUN), ...updates],
    leftOut: leftOut + Math.max(0, created.length - NEW_PER_RUN),
  }
}

const sameWords = (a: Bilingual, b: Bilingual) =>
  sharedWords(a.en, b.en) >= SAME_WORDS || sharedWords(a.fr, b.fr) >= SAME_WORDS

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

/**
 * FR-007, research R6, constitution IV: an insight the AI proposes again — its statement shares
 * 60% of its words with a rejected one (in either language), or it has exactly its support.
 */
export const isReproposal = (
  candidate: { readonly statement: Bilingual; readonly support: readonly string[] },
  rejected: readonly { readonly statement: Bilingual; readonly support: readonly string[] }[],
): boolean =>
  rejected.some(
    (r) => sameWords(candidate.statement, r.statement) || sameSet(candidate.support, r.support),
  )

const supportOf = (i: Insight) =>
  i.links.filter((l) => l.role === 'support' && l.state !== 'unlinked').map((l) => l.factId)

type RunContext = {
  readonly runId: string
  readonly at: Date
  /** The facts sent in the run, as they were. */
  readonly snapshots: ReadonlyMap<string, Snapshot>
  readonly newId: () => string
}

/**
 * FR-006, research R5: what a run's checked answer does to the project's insights. New ones come
 * proposed; an insight still proposed gets the new texts and AI links (a person's links stay); a
 * decided one keeps its texts and gets the facts it did not have as `suggested`; a rejected one,
 * and a fact a person unlinked, are left alone. `ref` is already the insight's id.
 */
export const mergeInsights = (
  existing: readonly Insight[],
  checked: readonly CheckedInsight[],
  projectId: string,
  run: RunContext,
): { creates: Insight[]; updates: Insight[]; leftOut: number } => {
  const byId = new Map(existing.map((i) => [i.id, i]))
  const rejected = existing
    .filter((i) => i.status === 'rejected')
    .map((i) => ({ statement: i.statement, support: supportOf(i) }))
  const live = existing.filter((i) => i.status !== 'rejected').map((i) => i.statement)
  const creates: Insight[] = []
  const updates = new Map<string, Insight>()
  let leftOut = 0
  const link = (factId: string, role: Link['role'], state: Link['state']): Link[] => {
    const snapshot = run.snapshots.get(factId)
    return snapshot ? [{ factId, role, state, origin: 'ai', snapshot, by: 'ai', at: run.at }] : []
  }
  const aiLinks = (c: CheckedInsight, skip: ReadonlySet<string>, state: Link['state']) => [
    ...c.support.filter((id) => !skip.has(id)).flatMap((id) => link(id, 'support', state)),
    ...c.counter.filter((id) => !skip.has(id)).flatMap((id) => link(id, 'counter', state)),
  ]
  for (const c of checked) {
    if (c.ref !== undefined) {
      const current = updates.get(c.ref) ?? byId.get(c.ref)
      if (!current || current.status === 'rejected') {
        if (!current) leftOut++
        continue
      }
      if (current.status === 'proposed') {
        const kept = current.links.filter((l) => l.origin === 'person' || l.state === 'unlinked')
        const links = [...kept, ...aiLinks(c, new Set(kept.map((l) => l.factId)), 'counted')]
        if (!links.some((l) => l.role === 'support' && l.state === 'counted')) continue
        updates.set(current.id, {
          ...current,
          theme: c.theme,
          statement: c.statement,
          description: c.description,
          counterEvidence: c.counterEvidence,
          minorityView: c.minorityView,
          translation: 'done',
          runId: run.runId,
          version: current.version + 1,
          links,
        })
      } else {
        const added = aiLinks(c, new Set(current.links.map((l) => l.factId)), 'suggested')
        if (added.length === 0) continue
        updates.set(current.id, {
          ...current,
          version: current.version + 1,
          links: [...current.links, ...added],
        })
      }
      continue
    }
    const repeated = [...live, ...creates.map((i) => i.statement)].some((s) =>
      sameWords(c.statement, s),
    )
    if (repeated || isReproposal(c, rejected)) {
      leftOut++
      continue
    }
    const links = aiLinks(c, new Set(), 'counted')
    if (!links.some((l) => l.role === 'support')) {
      leftOut++
      continue
    }
    creates.push({
      id: run.newId(),
      projectId,
      theme: c.theme,
      statement: c.statement,
      description: c.description,
      counterEvidence: c.counterEvidence,
      minorityView: c.minorityView,
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
