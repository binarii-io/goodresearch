import { factsRef, translationRef } from '../../domain/analysis-run.ts'
import type { Fact, FactStatus, Polarity, Statement, Theme } from '../../domain/facts.ts'
import type { SurveyFact } from '../../domain/survey-facts.ts'
import type { EvidenceStore } from '../ports.ts'
import type { SurveyFactStore } from '../survey-ports.ts'

/** A fact as Synthesis reads it (spec 013 research R1): no verbatim text, only who said it. */
export type FactForSynthesis = {
  readonly id: string
  readonly studyId: string
  /** Null for a survey fact (spec 029). */
  readonly sessionId: string | null
  readonly source: 'interview' | 'survey'
  /** Spec 029: a survey fact's base. */
  readonly respondents: number | null
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
/** Spec 029: a survey fact as Synthesis reads it: no session, no participant, its base. */
const surveyForSynthesis = (f: SurveyFact): FactForSynthesis => ({
  id: f.id,
  studyId: f.studyId,
  sessionId: null,
  source: 'survey',
  respondents: f.support.kind === 'figure' ? f.support.figure.base : f.support.share.base,
  statement: f.statement,
  polarity: f.polarity,
  theme: f.theme,
  status: f.status,
  participants: [],
  version: f.version,
  decidedAt: f.decidedAt,
})

export const makeSynthesisReads = (store: EvidenceStore, surveys: SurveyFactStore) => {
  const withParticipants = async (facts: readonly Fact[]): Promise<FactForSynthesis[]> => {
    const verbatims = await store.verbatimsByIds([...new Set(facts.flatMap((f) => f.verbatimIds))])
    const byId = new Map(verbatims.map((v) => [v.id, v]))
    return facts.map((f) => ({
      id: f.id,
      studyId: f.studyId,
      sessionId: f.sessionId,
      source: 'interview' as const,
      respondents: null,
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
    /** Spec 029: a survey study's facts by status, for the project page. */
    surveyCounts: (studyId: string) => surveys.counts(studyId),
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
      return [
        ...(await withParticipants(facts.filter((f) => f.status !== 'rejected'))),
        ...(await surveys.ofStudies(studyIds)).map(surveyForSynthesis),
      ]
    },
    /** Facts by id whatever their status, in the order asked; a deleted one is absent. */
    factsByIds: async (ids: readonly string[]) => {
      const [interviews, survey] = await Promise.all([store.factsByIds(ids), surveys.byIds(ids)])
      const found = new Map(
        [...(await withParticipants(interviews)), ...survey.map(surveyForSynthesis)].map((f) => [
          f.id,
          f,
        ]),
      )
      return ids.flatMap((id) => found.get(id) ?? [])
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
