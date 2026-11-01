import { nameKey } from '@goodresearch/shared'
import { analysisRef } from '../commands/analysis-commands.ts'
import type { IngestionDeps } from '../ports.ts'

/**
 * Spec 017: a study's interviews for the project's Overview. A count of people, never a name; no
 * access check (Reporting holds it), no backfill and no Drive.
 */
export const makeStudyOverview =
  (deps: Pick<IngestionDeps, 'store'>) => async (studyId: string) => {
    const sessions = await deps.store.sessionRosters(studyId)
    const totals = { proposed: 0, validated: 0, excluded: 0 }
    const people = new Set<string>()
    for (const s of sessions) {
      totals[s.state]++
      if (s.state === 'excluded') continue
      for (const r of s.roster) if (r.role === 'interviewee') people.add(nameKey(r.name))
    }
    return {
      ...totals,
      participants: people.size,
      validatedSessionIds: sessions.filter((s) => s.state === 'validated').map((s) => s.id),
    }
  }

/** Spec 017: a study's sessions and the ledger refs of analysing them, for the Overview's costs. */
export const makeStudyCostRefs =
  (deps: Pick<IngestionDeps, 'store'>) => async (studyId: string) => {
    const [sessionIds, analysed] = await Promise.all([
      deps.store.sessionIds(studyId),
      deps.store.analysedSessionIds(studyId),
    ])
    // A session deleted since was still paid for.
    return { sessionIds, analysisRefs: [...new Set([...sessionIds, ...analysed])].map(analysisRef) }
  }
