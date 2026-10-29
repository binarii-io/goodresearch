import type { FactNow, Link } from './insights.ts'

/** `to-decide`: the fact is still proposed in its study; shown, counted once accepted. */
export type LinkedFactState =
  | 'accepted'
  | 'to-decide'
  | 'not-accepted'
  | 'deleted'
  | 'outside'
  | 'changed'

const ACCEPTED: readonly FactNow['status'][] = ['accepted', 'edited']

/**
 * Research R7: a linked fact now, against the snapshot taken when it was linked or last reviewed.
 * A new version that kept its statement, polarity and theme (a decision) is not a change.
 */
export const linkState = (
  link: Link,
  fact: FactNow | undefined,
  projectStudyIds: ReadonlySet<string>,
): LinkedFactState => {
  if (!fact) return 'deleted'
  if (!projectStudyIds.has(fact.studyId)) return 'outside'
  if (fact.status === 'proposed') return 'to-decide'
  if (!ACCEPTED.includes(fact.status)) return 'not-accepted'
  const s = link.snapshot
  const changed =
    fact.version !== s.version &&
    (fact.polarity !== s.polarity ||
      (fact.theme?.id ?? null) !== s.themeId ||
      fact.statement.en !== s.statementEn)
  return changed ? 'changed' : 'accepted'
}

/** A counted link still standing for the insight: its fact is accepted and in the project. */
export const counts = (state: LinkedFactState) => state === 'accepted' || state === 'changed'

/** FR-012: the counted links whose fact changed, left or is no longer accepted (to decide is none). */
export const evidenceChanged = (
  links: readonly Link[],
  facts: ReadonlyMap<string, FactNow>,
  projectStudyIds: ReadonlySet<string>,
): number =>
  links.filter(
    (l) =>
      l.state === 'counted' &&
      !['accepted', 'to-decide'].includes(linkState(l, facts.get(l.factId), projectStudyIds)),
  ).length
