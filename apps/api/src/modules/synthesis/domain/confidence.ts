import type { FactNow, Link } from './insights.ts'
import { counts, linkState } from './links.ts'

/** A participant of the project: one roster person of one study (spec 013 assumptions). */
const keyOf = (studyId: string, participant: string) => `${studyId}|${participant}`

const ACCEPTED: readonly FactNow['status'][] = ['accepted', 'edited']

/**
 * FR-008: the participants with accepted facts in the project's studies; with `withToDecide`, also
 * those whose facts are still to decide (the panel once they are validated).
 */
export const panelOf = (
  facts: readonly FactNow[],
  projectStudyIds: ReadonlySet<string>,
  withToDecide = false,
): number =>
  new Set(
    facts
      .filter(
        (f) =>
          (ACCEPTED.includes(f.status) || (withToDecide && f.status === 'proposed')) &&
          projectStudyIds.has(f.studyId),
      )
      .flatMap((f) => f.participants.map((p) => keyOf(f.studyId, p))),
  ).size

const countedFacts = (
  links: readonly Link[],
  facts: ReadonlyMap<string, FactNow>,
  projectStudyIds: ReadonlySet<string>,
  role: Link['role'],
  withToDecide = false,
): FactNow[] =>
  links.flatMap((l) => {
    const fact = facts.get(l.factId)
    if (l.state !== 'counted' || l.role !== role || !fact) return []
    const state = linkState(l, fact, projectStudyIds)
    return counts(state) || (withToDecide && state === 'to-decide') ? [fact] : []
  })

/** Spec 015: the supporting facts counted, now or once those still to decide are accepted. */
export const supportFacts = (
  links: readonly Link[],
  facts: ReadonlyMap<string, FactNow>,
  projectStudyIds: ReadonlySet<string>,
  withToDecide = false,
): number => countedFacts(links, facts, projectStudyIds, 'support', withToDecide).length

const participantsOf = (facts: readonly FactNow[]) =>
  new Set(facts.flatMap((f) => f.participants.map((p) => keyOf(f.studyId, p)))).size

/** Spec 029: survey respondents behind these facts, the largest base of each study. */
const respondentsOf = (facts: readonly FactNow[]) => {
  const largest = new Map<string, number>()
  for (const f of facts)
    if (f.respondents) largest.set(f.studyId, Math.max(largest.get(f.studyId) ?? 0, f.respondents))
  return [...largest.values()].reduce((n, r) => n + r, 0)
}

/** Spec 029: a survey fact on this base or more raises the confidence by one level. */
export const SURVEY_BASE = 30

export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type Confidence = {
  readonly level: ConfidenceLevel
  readonly support: number
  /** Spec 029: survey respondents behind the supporting facts, apart from participants. */
  readonly respondents: number
  readonly counter: number
  readonly panel: number
  readonly highAt: number
  readonly missingForHigh: number
  readonly lowered: boolean
  /** Participants the linked facts still to decide would add once accepted. */
  readonly pendingSupport: number
  readonly pendingCounter: number
  /** The panel and the level once the facts still to decide are accepted. */
  readonly panelIfAccepted: number
  readonly levelIfAccepted: ConfidenceLevel
}

const MEDIUM_AT = 3
const LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low']

/**
 * FR-008, research R4: high from max(5, 30% of the panel) supporting participants, medium from
 * 3, low otherwise; counter-evidence from at least half as many participants lowers it one level.
 * No spread condition until participants have a team (clarification 2026-10-29). Spec 029: a
 * supporting survey fact with a base of 30 or more raises the level by one, at most high, before
 * counter-evidence is weighed.
 */
export const confidence = (
  links: readonly Link[],
  facts: ReadonlyMap<string, FactNow>,
  projectStudyIds: ReadonlySet<string>,
  panel: number,
  panelIfAccepted = panel,
): Confidence => {
  const highAtOf = (n: number) => Math.max(5, Math.ceil(0.3 * n))
  const highAt = highAtOf(panel)
  const levelOf = (support: number, counter: number, highAt: number, survey: boolean) => {
    const own: ConfidenceLevel =
      support >= highAt ? 'high' : support >= MEDIUM_AT ? 'medium' : 'low'
    const base = survey ? (LEVELS[Math.max(0, LEVELS.indexOf(own) - 1)] ?? own) : own
    const lowered = counter > 0 && counter >= Math.ceil(support / 2) && base !== 'low'
    return { level: lowered ? (LEVELS[LEVELS.indexOf(base) + 1] ?? 'low') : base, lowered }
  }
  const count = (role: Link['role'], withToDecide: boolean) =>
    participantsOf(countedFacts(links, facts, projectStudyIds, role, withToDecide))
  const surveyed = (withToDecide: boolean) =>
    countedFacts(links, facts, projectStudyIds, 'support', withToDecide).some(
      (f) => (f.respondents ?? 0) >= SURVEY_BASE,
    )
  const support = count('support', false)
  const counter = count('counter', false)
  const supportIfAccepted = count('support', true)
  const counterIfAccepted = count('counter', true)
  const { level, lowered } = levelOf(support, counter, highAt, surveyed(false))
  return {
    level,
    support,
    respondents: respondentsOf(countedFacts(links, facts, projectStudyIds, 'support')),
    counter,
    panel,
    highAt,
    missingForHigh: Math.max(0, highAt - support),
    lowered,
    pendingSupport: supportIfAccepted - support,
    pendingCounter: counterIfAccepted - counter,
    panelIfAccepted,
    levelIfAccepted: levelOf(
      supportIfAccepted,
      counterIfAccepted,
      highAtOf(panelIfAccepted),
      surveyed(true),
    ).level,
  }
}

export type InsightPolarity = 'positive' | 'negative' | 'neutral' | 'mixed'

/**
 * FR-009: from the counted supporting facts — neutral when under 30% of them are polarised;
 * positive or negative when one side holds 60% of the polarised ones; mixed otherwise.
 */
export const polarity = (
  links: readonly Link[],
  facts: ReadonlyMap<string, FactNow>,
  projectStudyIds: ReadonlySet<string>,
  /** Also the linked facts still to decide: the polarity once they are accepted (spec 015). */
  withToDecide = false,
): InsightPolarity => {
  const supporting = countedFacts(links, facts, projectStudyIds, 'support', withToDecide)
  const positive = supporting.filter((f) => f.polarity === 'positive').length
  const negative = supporting.filter((f) => f.polarity === 'negative').length
  const polarised = positive + negative
  if (supporting.length === 0 || polarised < 0.3 * supporting.length) return 'neutral'
  if (positive >= 0.6 * polarised) return 'positive'
  if (negative >= 0.6 * polarised) return 'negative'
  return 'mixed'
}
