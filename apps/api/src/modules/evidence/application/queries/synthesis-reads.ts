import { factsRef, translationRef } from '../../domain/analysis-run.ts'
import type { Fact, FactStatus, Polarity, Statement, Theme } from '../../domain/facts.ts'
import type { EvidenceStore } from '../ports.ts'

/** A fact as Synthesis reads it (spec 013 research R1): no verbatim text, only who said it. */
export type FactForSynthesis = {
  readonly id: string
  readonly studyId: string
  readonly sessionId: string
  readonly statement: Statement
  readonly polarity: Polarity
  readonly theme: Theme
  readonly status: FactStatus
  /** The pseudonym codes of its verbatims not set aside (`P01`); none while to attribute. */
  readonly participants: readonly string[]
  readonly version: number
  readonly decidedAt: Date | null
}

/** The facts the project-level synthesis reads; queries only, never a write. */
export const makeSynthesisReads = (store: EvidenceStore) => {
  const withParticipants = async (facts: readonly Fact[]): Promise<FactForSynthesis[]> => {
    const verbatims = await store.verbatimsByIds([...new Set(facts.flatMap((f) => f.verbatimIds))])
    const byId = new Map(verbatims.map((v) => [v.id, v]))
    return facts.map((f) => ({
      id: f.id,
      studyId: f.studyId,
      sessionId: f.sessionId,
      statement: f.statement,
      polarity: f.polarity,
      theme: f.theme,
      status: f.status,
      participants: [
        ...new Set(
          f.verbatimIds
            .map((id) => byId.get(id))
            .filter((v) => v && !v.setAside && v.participant)
            .map((v) => v?.participant ?? ''),
        ),
      ],
      version: f.version,
      decidedAt: f.decidedAt,
    }))
  }
  return {
    /** Spec 017: the facts of the interviews Analysis shows (validated), per status (SC-003). */
    studyCounts: (studyId: string, validatedSessionIds: readonly string[]) =>
      store.factCounts(studyId, validatedSessionIds),
    /** Spec 017: the ledger refs of finding the facts and translating them. */
    studyCostRefs: async (studyId: string, sessionIds: readonly string[]) => {
      const runs = await store.runsOf(studyId)
      // A session deleted since was still paid for.
      const read = runs.flatMap((r) => r.sessions.map((s) => s.sessionId))
      return [
        ...runs.flatMap((r) => r.sessions.map((s) => factsRef(r.id, s.sessionId))),
        ...[...new Set([...sessionIds, ...read])].map(translationRef),
      ]
    },
    /** The facts of these studies not rejected: accepted, edited, and still to decide (spec 013). */
    projectFacts: async (studyIds: readonly string[]) => {
      const facts = (await Promise.all(studyIds.map((id) => store.factsOfStudy(id)))).flat()
      return withParticipants(facts.filter((f) => f.status !== 'rejected'))
    },
    /** Facts by id whatever their status, in the order asked; a deleted one is absent. */
    factsByIds: async (ids: readonly string[]) => {
      const found = new Map((await store.factsByIds(ids)).map((f) => [f.id, f]))
      return withParticipants(ids.flatMap((id) => found.get(id) ?? []))
    },
    /**
     * Spec 015: the verbatims of these facts for the debrief deck, with their participant's code;
     * a verbatim set aside or still to attribute is left out. The caller replaces names.
     */
    verbatimsOf: async (factIds: readonly string[]) => {
      const facts = await store.factsByIds(factIds)
      const verbatims = await store.verbatimsByIds([
        ...new Set(facts.flatMap((f) => f.verbatimIds)),
      ])
      const byId = new Map(verbatims.map((v) => [v.id, v]))
      return facts.flatMap((f) =>
        f.verbatimIds.flatMap((id) => {
          const v = byId.get(id)
          return v && !v.setAside && v.participant
            ? [{ factId: f.id, studyId: f.studyId, participant: v.participant, text: v.text }]
            : []
        }),
      )
    },
  }
}
