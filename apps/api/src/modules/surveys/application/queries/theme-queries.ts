import { err, maskAnswer, ok } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import { surveysThemeAnswers, surveysThemes } from '../../infrastructure/schema.ts'
import type { SurveysDeps } from '../ports.ts'
import type { ThemeStore } from '../theme-ports.ts'
import { makeFigureQueries } from './figure-queries.ts'
import { figuresText } from './figures-text.ts'
import { makeSurveyContext } from './response-queries.ts'

const PAGE_SIZE = 50

/** Spec 029 US3: the themes of a study's open items, as people read and use them. */
export const makeThemeQueries = (
  deps: SurveysDeps & {
    db: Db
    themes: ThemeStore
    knownNames: (accountId: string, studyId: string) => Promise<readonly string[]>
    accountNames: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>
  },
) => {
  const { db } = deps
  const figures = makeFigureQueries(deps)
  const context = makeSurveyContext(deps)

  /** The item's counted answers, masked as they would be sent, with their theme (ADR-0012). */
  const answersOf = async (accountId: string, studyId: string, itemId: string) => {
    const c = await context(accountId, studyId)
    if (!c.ok) return c
    const item = c.value.sections.flatMap((s) => s.items).find((i) => i.id === itemId)
    if (!item || item.kind !== 'open' || item.contact) return err('ITEM_NOT_FOUND' as const)
    const fileId = c.value.form?.fileId
    const raw = fileId
      ? await deps.themes.openAnswers(studyId, fileId, c.value.accepted, itemId)
      : []
    const themes = await deps.themes.themesOf(studyId, itemId)
    const live = new Set(themes.filter((t) => t.status !== 'rejected').map((t) => t.id))
    const themeOf = new Map(
      (await deps.themes.answersOf(studyId, itemId))
        .filter((a) => live.has(a.themeId))
        .map((a) => [a.sourceId, a]),
    )
    const names = await deps.knownNames(accountId, studyId)
    const masked = raw.map((a) => ({
      responseId: a.sourceId,
      text: maskAnswer(a.text, names),
      themeId: themeOf.get(a.sourceId)?.themeId ?? null,
      quote: themeOf.get(a.sourceId)?.quote ?? null,
    }))
    return ok({ masked, themes })
  }

  return {
    /** FR-009: an open item's themes, with their answers and verified quotes. */
    list: async (accountId: string, studyId: string, itemId: string) => {
      const a = await answersOf(accountId, studyId, itemId)
      if (!a.ok) return a
      const { masked, themes } = a.value
      const names = await deps.accountNames(
        themes.flatMap((t) => (t.decidedBy ? [t.decidedBy] : [])),
      )
      const shown = masked.filter((m) => m.text !== null)
      return ok({
        themes: themes
          .filter((t) => !t.mergedInto)
          .map((t) => {
            const own = shown.filter((m) => m.themeId === t.id)
            return {
              id: t.id,
              itemId: t.itemId,
              label: t.label,
              description: t.description,
              translation: t.translation,
              origin: t.origin,
              status: t.status,
              answers: own.length,
              quotes: own.flatMap((m) => (m.quote ? [m.quote] : [])).slice(0, 5),
              decidedBy: t.decidedBy
                ? { id: t.decidedBy, name: names.get(t.decidedBy) ?? null }
                : null,
              decidedAt: t.decidedAt?.toISOString() ?? null,
              version: t.version,
            }
          }),
        unthemed: shown.filter((m) => m.themeId === null).length,
        answers: shown.length,
      })
    },

    /** One page of masked answers, all, of one theme, or in no theme (`none`). */
    answers: async (
      accountId: string,
      studyId: string,
      itemId: string,
      query: { theme?: string | undefined; page: number },
    ) => {
      const a = await answersOf(accountId, studyId, itemId)
      if (!a.ok) return a
      const shown = a.value.masked.flatMap((m) =>
        m.text === null ? [] : [{ responseId: m.responseId, text: m.text, themeId: m.themeId }],
      )
      const chosen = shown.filter((m) =>
        query.theme === undefined
          ? true
          : query.theme === 'none'
            ? m.themeId === null
            : m.themeId === query.theme,
      )
      const page = Math.max(1, query.page)
      return ok({
        answers: chosen.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        total: chosen.length,
        page,
        pageSize: PAGE_SIZE,
        leftOut: a.value.masked.length - shown.length,
      })
    },

    /** What a fact made from a theme keeps (US4): its texts, share and quotes; null if none. */
    forFact: async (accountId: string, studyId: string, themeId: string) => {
      const read = await figures.read(accountId, studyId, null)
      if (!read.ok) return null
      const [theme] = await db
        .select()
        .from(surveysThemes)
        .where(and(eq(surveysThemes.id, themeId), eq(surveysThemes.studyId, studyId)))
      if (!theme) return null
      const section = read.value.sections.find((s) => s.items.some((i) => i.id === theme.itemId))
      const item = section?.items.find((i) => i.id === theme.itemId)
      if (!section || !item) return null
      // Its share counts only answers of counted responses, as the base does.
      const a = await answersOf(accountId, studyId, theme.itemId)
      if (!a.ok) return null
      const answers = a.value.masked.filter((x) => x.themeId === themeId)
      const base = read.value.view.openItems.find((o) => o.id === theme.itemId)?.answers ?? 0
      return {
        itemId: theme.itemId,
        itemText: item.text,
        status: theme.status as 'proposed' | 'accepted' | 'rejected',
        label: { en: theme.labelEn, fr: theme.labelFr },
        description: { en: theme.descriptionEn, fr: theme.descriptionFr },
        share: { answers: answers.length, base },
        quotes: answers.flatMap((a) => (a.quote ? [a.quote] : [])).slice(0, 5),
        section: { id: section.id, title: section.title ?? '' },
      }
    },
    /**
     * Spec 029 FR-010a: what "Find facts" sends: the flat sort as text (figures, never an answer)
     * and the accepted themes with their share.
     */
    forFinding: async (accountId: string, studyId: string) => {
      const read = await figures.read(accountId, studyId, null)
      if (!read.ok) return read
      const { view } = read.value
      const items = new Map(view.openItems.map((o) => [o.id, o]))
      const rows = await db
        .select({
          id: surveysThemes.id,
          itemId: surveysThemes.itemId,
          label: surveysThemes.labelEn,
          description: surveysThemes.descriptionEn,
        })
        .from(surveysThemes)
        .where(and(eq(surveysThemes.studyId, studyId), eq(surveysThemes.status, 'accepted')))
      // Answers of counted responses only, as the base (FR-010).
      const held = new Map<string, number>()
      for (const itemId of new Set(rows.map((t) => t.itemId))) {
        const a = await answersOf(accountId, studyId, itemId)
        if (!a.ok) continue
        for (const x of a.value.masked)
          if (x.themeId) held.set(x.themeId, (held.get(x.themeId) ?? 0) + 1)
      }
      return ok({
        counted: view.counts.counted,
        figureCount: view.sections.reduce((n, s) => n + s.figures.length, 0),
        figures: figuresText(view),
        themes: rows.flatMap((t) => {
          const item = items.get(t.itemId)
          return item
            ? [{ ...t, item: item.text, answers: held.get(t.id) ?? 0, base: item.answers }]
            : []
        }),
      })
    },
    /** How many answers each theme of an item holds, not rejected ones. */
    counts: (studyId: string, itemId: string) =>
      db
        .select({ themeId: surveysThemeAnswers.themeId, n: sql<number>`count(*)::int` })
        .from(surveysThemeAnswers)
        .where(
          and(eq(surveysThemeAnswers.studyId, studyId), eq(surveysThemeAnswers.itemId, itemId)),
        )
        .groupBy(surveysThemeAnswers.themeId),
  }
}
