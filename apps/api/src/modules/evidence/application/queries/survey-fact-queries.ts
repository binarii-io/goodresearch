import { err, ok } from '@goodresearch/shared'
import { figureChanged, type SurveyFact } from '../../domain/survey-facts.ts'
import type { SurveyFactDeps } from '../survey-ports.ts'

const PAGE_SIZE = 50

/** Spec 029: a study's survey facts, each with today's figure when it moved (FR-012). */
export const makeSurveyFactQueries = (deps: SurveyFactDeps) => ({
  page: async (
    accountId: string,
    studyId: string,
    query: { status?: 'to-decide' | 'accepted' | 'rejected' | 'all' | undefined; page: number },
  ) => {
    const access = await deps.studyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'survey') return err('NOT_A_SURVEY_STUDY' as const)
    const page = Math.max(1, query.page)
    const { facts, total } = await deps.store.page(studyId, query.status ?? 'all', page, PAGE_SIZE)
    // One read of today's figures for the whole page, one per cross (research R3).
    const figured = facts.filter(
      (f): f is SurveyFact & { support: { kind: 'figure' } } => f.support.kind === 'figure',
    )
    const today = figured.length
      ? await deps.surveys.figures(
          accountId,
          studyId,
          figured.map((f) => f.support.figure),
        )
      : ok([])
    if (!today.ok) return today
    const now = new Map(figured.map((f, i) => [f.id, today.value[i] ?? null]))
    const items = new Map(
      [...now.values()].flatMap((t) => (t ? [[t.snapshot.itemId, t.context.itemText]] : [])),
    )
    const names = await deps.accountNames(facts.flatMap((f) => (f.decidedBy ? [f.decidedBy] : [])))
    return ok({
      facts: facts.map((f) => {
        const t = now.get(f.id)
        const changed =
          f.support.kind === 'figure' && t ? figureChanged(f.support.figure, t.snapshot) : null
        return {
          id: f.id,
          statement: f.statement,
          translation: f.translation,
          polarity: f.polarity,
          theme: f.theme,
          support:
            f.support.kind === 'figure'
              ? {
                  kind: 'figure' as const,
                  itemId: f.support.itemId,
                  itemText: items.get(f.support.itemId) ?? '',
                  figure: f.support.figure,
                }
              : {
                  kind: 'theme' as const,
                  itemId: f.support.itemId,
                  itemText: '',
                  themeId: f.support.themeId,
                  share: f.support.share,
                  quotes: [...f.support.quotes],
                },
          figureChanged: changed,
          itemRemoved: f.support.kind === 'figure' && now.has(f.id) && t === null,
          origin: f.origin,
          status: f.status,
          decidedBy: f.decidedBy ? { id: f.decidedBy, name: names.get(f.decidedBy) ?? null } : null,
          decidedAt: f.decidedAt?.toISOString() ?? null,
          version: f.version,
        }
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    })
  },
})
