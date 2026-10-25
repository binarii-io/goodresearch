import type { InterviewGuide } from './interview-guide.ts'
import type { PlannedInterview } from './planned-interview.ts'

export interface InterviewGuideRepository {
  findByStudy(studyId: string): Promise<InterviewGuide | null>
  /** Throws `ConcurrencyError` when the study already has a guide (two first saves racing). */
  insert(guide: InterviewGuide): Promise<void>
  /** Optimistic locking; throws `ConcurrencyError` on a stale version. */
  update(guide: InterviewGuide): Promise<void>
}

export interface PlannedInterviewRepository {
  findById(id: string): Promise<PlannedInterview | null>
  /**
   * Inserts a new row only while the study has fewer than `limit` rows, atomically (two people
   * adding at once cannot pass the limit); false when the schedule is full.
   */
  insertIfRoom(row: PlannedInterview, limit: number): Promise<boolean>
  /** Optimistic locking; throws `ConcurrencyError` on a stale version. */
  update(row: PlannedInterview): Promise<void>
  delete(id: string): Promise<void>
}
