import { holdsName } from '@goodresearch/shared'
import type { Bilingual, InsightStatus, PendingTranslation, Translation } from './insights.ts'
import { removePercentages } from './insights.ts'

/** Context map KeyTakeaways: the project's summary in 2 to 4 sentences (spec 014 FR-010). */
export type Takeaways = {
  readonly projectId: string
  readonly text: Bilingual
  readonly translation: Translation
  readonly pendingTranslation?: PendingTranslation | null | undefined
  readonly savedBy: string | null
  readonly savedAt: Date | null
  readonly version: number
  /** The insights and recommendations it was saved over (`id:version`, sorted). */
  readonly savedOver: readonly string[] | null
  /** It rests on what is still to decide too (FR-010, update). */
  readonly withProposed: boolean
  readonly draft: {
    readonly text: Bilingual | null
    readonly state: 'none' | 'drafting' | 'ready' | 'failed'
    /** The draft read what is still to decide too. */
    readonly withProposed: boolean
    /** What the draft read: the basis its text rests on once used (review of PR #14). */
    readonly savedOver?: readonly string[] | null | undefined
    readonly by: string | null
    readonly at: Date | null
  }
}

export const TAKEAWAYS_MAX = 1200
const MIN_SENTENCES = 2
const MAX_SENTENCES = 4

/**
 * Research R5: a draft keeps the sentences without a percentage or a known name, at most 4; with
 * fewer than 2 left it is no draft.
 */
export const checkDraft = (
  sentences: readonly Bilingual[],
  names: readonly string[],
): Bilingual | null => {
  const kept = sentences
    .map((s) => ({ en: s.en.trim(), fr: s.fr.trim() }))
    .filter(
      (s) =>
        s.en &&
        s.fr &&
        removePercentages(s.en) === s.en &&
        removePercentages(s.fr) === s.fr &&
        !holdsName(s.en, names) &&
        !holdsName(s.fr, names),
    )
    .slice(0, MAX_SENTENCES)
  if (kept.length < MIN_SENTENCES) return null
  return { en: kept.map((s) => s.en).join(' '), fr: kept.map((s) => s.fr).join(' ') }
}

/**
 * What a takeaways text rests on, as its meaning goes: who decided and when, the run that wrote it,
 * and an insight's computed confidence. A translation, a review or a suggested link raise an
 * item's version without changing its meaning, so the version is not part of it (review of PR #14).
 */
export type Basis = {
  readonly id: string
  readonly status: InsightStatus
  readonly decidedAt: Date | null
  readonly runId: string | null
  readonly level?: string | undefined
}

const markOf = (x: Basis) =>
  [x.id, x.status, x.decidedAt?.getTime() ?? 0, x.runId ?? '', x.level ?? ''].join(':')

/**
 * What the takeaways rest on: the validated insights and recommendations; with `withProposed`,
 * also those still to decide (spec 014 FR-010, update).
 */
export const savedOverOf = (
  insights: readonly Basis[],
  recommendations: readonly Basis[],
  withProposed = false,
) =>
  [...insights, ...recommendations]
    .filter(
      (x) =>
        x.status === 'validated' ||
        x.status === 'edited' ||
        (withProposed && x.status === 'proposed'),
    )
    .map(markOf)
    .sort()

/** How many of what the takeaways rest on are still to decide now. */
export const toValidate = (savedOver: readonly string[] | null, now: readonly Basis[]): number => {
  if (!savedOver) return 0
  const ids = new Set(savedOver.map((x) => x.split(':')[0]))
  return now.filter((x) => ids.has(x.id) && x.status === 'proposed').length
}

/** FR-010: "May be out of date" when what they rest on changed since they were saved. */
export const outOfDate = (savedOver: readonly string[] | null, now: readonly string[]): boolean =>
  savedOver !== null && (savedOver.length !== now.length || savedOver.some((x, i) => x !== now[i]))
