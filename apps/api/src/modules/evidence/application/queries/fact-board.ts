import { err, ok } from '@goodresearch/shared'
import type { FactBoardStatus, FactBoardStore } from '../fact-board-ports.ts'
import type { StudyAccess } from '../ports.ts'

/** Facts per page of a study's Facts list (load only what is shown). */
export const FACT_BOARD_PAGE = 25

/**
 * Spec 039 FR-003: the facts of one study, whatever their source, with the same statuses, filters
 * and counts; read by its team, who decide them.
 */
export const makeFactBoard =
  (deps: {
    board: FactBoardStore
    studyAccess: (accountId: string, studyId: string) => Promise<StudyAccess | null>
  }) =>
  async (
    accountId: string,
    studyId: string,
    query: {
      status?: FactBoardStatus | undefined
      q?: string | undefined
      page?: number | undefined
    },
  ) => {
    const access = await deps.studyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    const page = Math.max(1, query.page ?? 1)
    const status = query.status ?? 'to-decide'
    const read = await deps.board.page(studyId, { status, q: query.q, page }, FACT_BOARD_PAGE)
    return ok({
      items: read.rows.map((r) => ({
        ...r,
        status: r.status === 'proposed' ? ('to-decide' as const) : r.status,
        canDecide: true,
      })),
      total: read.total,
      counts: read.counts,
      page,
      pageSize: FACT_BOARD_PAGE,
    })
  }

/** Spec 039: a study's facts per status, without their rows (an Analysis tab's tiles and tab). */
export const makeFactCounts =
  (deps: {
    board: FactBoardStore
    studyAccess: (accountId: string, studyId: string) => Promise<StudyAccess | null>
  }) =>
  async (accountId: string, studyId: string) => {
    const access = await deps.studyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    return ok(await deps.board.counts(studyId))
  }
