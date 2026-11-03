import type { SurveyFactStore } from '../../application/survey-ports.ts'
import type { SurveyFact } from '../../domain/survey-facts.ts'

/** Survey facts kept in memory (spec 029), newest first as the real store reads them. */
export const inMemorySurveyFacts = () => {
  const facts = new Map<string, SurveyFact>()
  const newest = () => [...facts.values()].reverse()
  const store: SurveyFactStore = {
    insert: async (fact) => {
      facts.set(fact.id, fact)
    },
    get: async (id) => facts.get(id) ?? null,
    save: async (fact, expected) => {
      if (facts.get(fact.id)?.version !== expected) return 'conflict'
      facts.set(fact.id, fact)
      return 'ok'
    },
    page: async (studyId, status, page, size) => {
      const all = newest().filter(
        (f) =>
          f.studyId === studyId &&
          (status === 'all' ||
            (status === 'to-decide' && f.status === 'proposed') ||
            (status === 'accepted' && (f.status === 'accepted' || f.status === 'edited')) ||
            (status === 'rejected' && f.status === 'rejected')),
      )
      return { facts: all.slice((page - 1) * size, page * size), total: all.length }
    },
    counts: async (studyId) => {
      const counts = new Map<SurveyFact['status'], number>()
      for (const f of facts.values())
        if (f.studyId === studyId) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
      return [...counts].map(([status, count]) => ({ status, count }))
    },
    allOf: async (studyId) => newest().filter((f) => f.studyId === studyId),
    ofStudies: async (ids) =>
      newest().filter((f) => ids.includes(f.studyId) && f.status !== 'rejected'),
    byIds: async (ids) => newest().filter((f) => ids.includes(f.id)),
  }
  return { facts, store }
}
