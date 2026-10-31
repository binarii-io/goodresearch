import {
  conductRoles,
  err,
  interviewerCode,
  ok,
  type Person,
  type Role,
} from '@goodresearch/shared'
import { type EvaluationState, evaluationState } from '../domain/evaluation-state.ts'
import { reanchor } from '../domain/remarks.ts'
import { isReviewLive, type ReviewRun } from '../domain/review-run.ts'
import {
  isMeasurable,
  type SpeakingTimes,
  speakersIdentified,
  speakingTimes,
} from '../domain/speaking-times.ts'
import type {
  AnalysedText,
  Evaluation,
  QualityDeps,
  SourceSession,
  StoredRemark,
  StudyAccess,
} from './ports.ts'

export type StudyError = 'STUDY_NOT_FOUND' | 'NOT_AN_INTERVIEW_STUDY' | 'FOLDER_ACCESS_REQUIRED'

/** FR-016: the study's access rules (spec 002 FR-010a): its project team, its folder access. */
export const studyOf = async (deps: QualityDeps, accountId: string, studyId: string) => {
  const access = await deps.sources.studyAccess(accountId, studyId)
  if (!access) return err('STUDY_NOT_FOUND' as const)
  if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY' as const)
  const sessions = await deps.sources.sessions(accountId, studyId)
  if (!sessions) return err('FOLDER_ACCESS_REQUIRED' as const)
  return ok({ access, sessions })
}

/** One validated interview as the Quality tab sees it now: computed, never stored. */
export type InterviewNow = {
  readonly session: SourceSession
  readonly text: AnalysedText | null
  readonly hasTranscript: boolean
  readonly notImported: boolean
  readonly people: readonly Person[]
  readonly times: SpeakingTimes
  readonly measurable: boolean
  readonly evaluation: Evaluation | null
  readonly state: EvaluationState
  /** Who speaks a turn, for the figures on how the interview was conducted. */
  readonly roleOf: (label: string | null) => Role
  /** Its remarks, each with its place in the current text; null when no longer found. */
  readonly remarks: readonly {
    readonly remark: StoredRemark
    readonly place: { segmentId: string; offset: number; length: number } | null
  }[]
  /** Which interviewer a label is, for a turn known as an interviewer's. */
  readonly interviewerOf: (label: string | null) => string | null
}

const NO_TIMES: SpeakingTimes = {
  words: { interviewers: 0, interviewees: 0, unknown: 0 },
  minutes: null,
}

export const interviewsNow = async (
  deps: QualityDeps,
  accountId: string,
  studyId: string,
  access: StudyAccess,
  sessions: readonly SourceSession[],
  runs: readonly ReviewRun[],
): Promise<InterviewNow[]> => {
  const [evaluations, remarks, people] = await Promise.all([
    deps.store.evaluationsOf(studyId),
    deps.store.remarksOf(studyId),
    deps.sources.people(accountId, studyId, { assign: false }),
  ])
  const live = runs.find((r) => isReviewLive(r, deps.clock.now())) ?? null
  return Promise.all(
    sessions.map(async (session) => {
      const [found, attributions] = await Promise.all([
        deps.sources.analysedText(accountId, studyId, session.id, access.textAnalysed),
        deps.sources.speakerAttributions(session.id),
      ])
      const text = typeof found === 'string' ? null : found
      const mine = people?.[session.id] ?? []
      const roles = conductRoles(text?.turns.map((t) => t.speaker) ?? [], mine, attributions)
      const roleOf = (label: string | null): Role => roles.get(label)?.role ?? 'unknown'
      const times = text ? speakingTimes(text.turns, roleOf) : NO_TIMES
      const measurable = isMeasurable(times.words)
      const placed = remarks
        .filter((r) => r.sessionId === session.id)
        .map((remark) => ({
          remark,
          place: text ? reanchor(remark, text.turns) : null,
        }))
      const evaluation = evaluations.find((e) => e.sessionId === session.id) ?? null
      const reading = live?.sessions.find((s) => s.sessionId === session.id)
      return {
        session,
        text,
        hasTranscript: session.transcript !== null || found !== 'no-transcript',
        people: mine,
        times,
        measurable,
        evaluation,
        roleOf,
        remarks: placed,
        interviewerOf: (label: string | null) => interviewerCode(label, mine) || null,
        // Its file not imported yet: a review or opening it does.
        notImported: session.transcript !== null && found === 'no-transcript',
        state:
          session.transcript !== null && found === 'no-transcript'
            ? 'not-reviewed'
            : evaluationState({
                hasTranscript: found !== 'no-transcript',
                measurable,
                speakersIdentified: text === null || speakersIdentified(times.words),
                reviewing: reading?.state === 'waiting' || reading?.state === 'reading',
                text,
                evaluation,
                textAnalysed: access.textAnalysed,
                anonymised: access.anonymised,
                // Only when the text moved since the review: else one kept for its opinion asks forever.
                lost:
                  text && evaluation && text.fingerprint !== evaluation.fingerprint
                    ? placed.filter((r) => r.place === null).length
                    : 0,
              }),
      }
    }),
  )
}
