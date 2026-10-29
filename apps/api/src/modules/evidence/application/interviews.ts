import { err, ok } from '@goodresearch/shared'
import { analysisState, type FactsState } from '../domain/analysis-state.ts'
import type { Fact } from '../domain/facts.ts'
import { reanchor } from '../domain/verbatims.ts'
import type {
  AnalysedText,
  EvidenceDeps,
  Reading,
  SourceSession,
  StoredVerbatim,
  StudyAccess,
} from './ports.ts'

export type StudyError =
  | 'STUDY_NOT_FOUND'
  | 'NOT_AN_INTERVIEW_STUDY'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'SESSION_NOT_FOUND'

/** FR-019: the study's access rules (spec 002 FR-010a): its project team, its folder access. */
export const studyOf = async (deps: EvidenceDeps, accountId: string, studyId: string) => {
  const access = await deps.sources.studyAccess(accountId, studyId)
  if (!access) return err('STUDY_NOT_FOUND' as const)
  if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
  const sessions = await deps.sources.sessions(accountId, studyId)
  if (!sessions) return err('FOLDER_ACCESS_REQUIRED' as const)
  return ok({ access, sessions })
}

export type Place = { segmentId: string; offset: number; length: number }

/** One validated interview as Analysis sees it now (research R3: computed, never stored). */
export type InterviewNow = {
  readonly session: SourceSession
  readonly text: AnalysedText | null
  readonly hasTranscript: boolean
  readonly reading: Reading | null
  readonly verbatims: readonly StoredVerbatim[]
  /** Where each verbatim is now; null when its text is no longer there. */
  readonly places: ReadonlyMap<string, Place | null>
  readonly facts: readonly Fact[]
  readonly lost: number
  readonly state: FactsState
}

const placesOf = (
  verbatims: readonly StoredVerbatim[],
  text: AnalysedText | null,
): Map<string, Place | null> =>
  new Map(
    verbatims.map((v) => [
      v.id,
      text
        ? reanchor(v, text.turns)
        : { segmentId: v.segmentId, offset: v.offset, length: v.length },
    ]),
  )

/** Every validated interview of the study, its analysed text, verbatims re-anchored, its state. */
export const interviewsNow = async (
  deps: EvidenceDeps,
  accountId: string,
  studyId: string,
  access: StudyAccess,
  sessions: readonly SourceSession[],
): Promise<InterviewNow[]> => {
  const [readings, verbatims, facts] = await Promise.all([
    deps.store.readingsOf(studyId),
    deps.store.verbatimsOfStudy(studyId),
    deps.store.factsOfStudy(studyId),
  ])
  return Promise.all(
    sessions.map(async (session) => {
      const found = await deps.sources.analysedText(
        accountId,
        studyId,
        session.id,
        access.textAnalysed,
      )
      const text = typeof found === 'string' ? null : found
      const mine = verbatims.filter((v) => v.sessionId === session.id)
      const places = placesOf(mine, text)
      const used = new Set(
        facts
          .filter((f) => f.sessionId === session.id && f.status !== 'rejected')
          .flatMap((f) => f.verbatimIds),
      )
      // A lost verbatim matters when it was kept: not set aside, and used or never decided.
      const lost = mine.filter(
        (v) => !v.setAside && used.has(v.id) && places.get(v.id) === null,
      ).length
      const myFacts = facts.filter((f) => f.sessionId === session.id)
      const reading = readings.find((r) => r.sessionId === session.id) ?? null
      return {
        session,
        text,
        hasTranscript: found !== 'no-transcript',
        reading,
        verbatims: mine,
        places,
        facts: myFacts,
        lost,
        state: analysisState({
          hasTranscript: found !== 'no-transcript',
          text,
          reading,
          textAnalysed: access.textAnalysed,
          anonymised: access.anonymised,
          lost,
          toDecide: myFacts.filter((f) => f.status === 'proposed').length,
        }),
      }
    }),
  )
}
