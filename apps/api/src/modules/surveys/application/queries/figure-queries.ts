import { err, ok } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import {
  citedValue,
  columnOf,
  crossColumns,
  type FigureItem,
  type FigureMeasure,
  type ItemCounts,
} from '../../domain/figures.ts'
import type { SurveyItem } from '../../domain/responses.ts'
import {
  surveysResponses,
  surveysThemeAnswers,
  surveysThemeRuns,
  surveysThemes,
} from '../../infrastructure/schema.ts'
import type { SurveysDeps } from '../ports.ts'
import { makeSurveyContext, stateSql } from './response-queries.ts'

/** The ledger refs of a study's analysis (spec 029 research R8). */
export const themeRunRef = (runId: string, part: number) => `survey-themes:${runId}:${part}`
export const surveyFactsTranslationRef = (studyId: string) => `facts-translation:survey:${studyId}`
export const themesTranslationRef = (studyId: string) => `survey-themes-translation:${studyId}`
/** Every "Find facts" of the study (Evidence's ref, FR-010a). */
export const surveyFactsFindRef = (studyId: string) => `survey-facts:${studyId}`

const figureItem = (item: SurveyItem): FigureItem | null =>
  item.kind === 'likert'
    ? { kind: 'likert', points: item.points ?? 5 }
    : item.kind === 'single-choice' || item.kind === 'multiple-choice'
      ? { kind: item.kind, options: item.options ?? [] }
      : null

type Row = Record<string, unknown>

/** A figure as a fact points at it (spec 029). */
export type FigureRef = {
  readonly itemId: string
  readonly measure: FigureMeasure
  readonly option?: string | undefined
  readonly cross?: { readonly itemId: string; readonly option: string } | undefined
}
const rowsOf = async (db: Db, query: ReturnType<typeof sql>) =>
  (await db.execute(query)).rows as Row[]

/**
 * Spec 029 US1, US2: the figures of a study's counted responses, computed at each read in SQL
 * (counts per value and respondents per item), measures in the pure domain. Nothing is stored.
 */
export const makeFigureQueries = (deps: SurveysDeps & { db: Db }) => {
  const { db } = deps
  const context = makeSurveyContext(deps)

  /** Counts per item (and per profiling value with a cross) over the counted responses. */
  const countsOf = async (
    studyId: string,
    fileId: string,
    counted: ReturnType<typeof stateSql>,
    crossBy: string | null,
  ) => {
    const where = sql`${surveysResponses.studyId} = ${studyId} AND ${surveysResponses.formFileId} = ${fileId} AND ${counted} = 'counted'`
    const profile = crossBy
      ? sql`, jsonb_array_elements_text(${surveysResponses.answers} -> ${crossBy}) AS p(value)`
      : sql``
    const profileCol = crossBy ? sql`p.value` : sql`NULL::text`
    const [values, bases] = await Promise.all([
      rowsOf(
        db,
        sql`SELECT k.key AS item, ${profileCol} AS profile, v.value AS value, count(*)::int AS n
          FROM ${surveysResponses}${profile}, jsonb_each(${surveysResponses.answers}) AS k(key, value),
            jsonb_array_elements_text(k.value) AS v(value)
          WHERE ${where} GROUP BY 1, 2, 3`,
      ),
      rowsOf(
        db,
        sql`SELECT k.key AS item, ${profileCol} AS profile, count(*)::int AS n
          FROM ${surveysResponses}${profile}, jsonb_each(${surveysResponses.answers}) AS k(key, value)
          WHERE ${where} AND jsonb_array_length(k.value) > 0 GROUP BY 1, 2`,
      ),
    ])
    const key = (item: unknown, profile: unknown) => `${String(item)}|${profile ?? ''}`
    const counts = new Map<string, { base: number; values: Map<string, number> }>()
    const entry = (k: string) => {
      let found = counts.get(k)
      if (!found) {
        found = { base: 0, values: new Map() }
        counts.set(k, found)
      }
      return found
    }
    for (const r of bases) entry(key(r.item, r.profile)).base = Number(r.n)
    for (const r of values) entry(key(r.item, r.profile)).values.set(String(r.value), Number(r.n))
    return (item: string, profile: string | null): ItemCounts =>
      counts.get(key(item, profile)) ?? { base: 0, values: new Map() }
  }

  /** Every figure, and what a fact needs besides: the rule's version and the sections. */
  const read = async (accountId: string, studyId: string, crossBy: string | null) => {
    const c = await context(accountId, studyId)
    if (!c.ok) return c
    const { sections, accepted } = c.value
    const crossable = sections
      .filter((s) => s.kind === 'profiling')
      .flatMap((s) => s.items)
      .filter((i) => !i.contact && (i.kind === 'single-choice' || i.kind === 'multiple-choice'))
    const cross = crossBy ? crossable.find((i) => i.id === crossBy) : null
    if (crossBy && !cross) return err('VALIDATION' as const)
    const fileId = c.value.form?.fileId ?? null
    const counted = stateSql(accepted)
    const flat = fileId ? await countsOf(studyId, fileId, counted, null) : null
    const crossed = fileId && cross ? await countsOf(studyId, fileId, counted, cross.id) : null
    const none = (): ItemCounts => ({ base: 0, values: new Map() })

    // Counted and set aside, as Fieldwork counts them (spec 028).
    const states = fileId
      ? await rowsOf(
          db,
          sql`SELECT ${counted} AS state, count(*)::int AS n FROM ${surveysResponses}
              WHERE ${surveysResponses.studyId} = ${studyId} AND ${surveysResponses.formFileId} = ${fileId}
              GROUP BY 1`,
        )
      : []
    const countedN = Number(states.find((r) => r.state === 'counted')?.n ?? 0)
    const setAside = states
      .filter((r) => r.state === 'out-of-target' || r.state === 'profile-not-answered')
      .reduce((n, r) => n + Number(r.n), 0)

    // Responses submitted before an item's last rewording answered a former wording (spec 028).
    const former = fileId
      ? await rowsOf(
          db,
          sql`SELECT k.key AS item, count(*)::int AS n
              FROM ${surveysResponses}, jsonb_each(${surveysResponses.answers}) AS k(key, value),
                (SELECT item_id, max(until) AS until FROM surveys_item_wordings
                  WHERE study_id = ${studyId} GROUP BY item_id) AS w
              WHERE ${surveysResponses.studyId} = ${studyId} AND ${surveysResponses.formFileId} = ${fileId}
                AND ${counted} = 'counted' AND w.item_id = k.key
                AND ${surveysResponses.submittedAt} < w.until AND jsonb_array_length(k.value) > 0
              GROUP BY 1`,
        )
      : []
    const formerOf = new Map(former.map((r) => [String(r.item), Number(r.n)]))

    // Open items: answers, and what themes hold (US3).
    const themed = await db
      .select({
        itemId: surveysThemeAnswers.itemId,
        answers: sql<number>`count(DISTINCT ${surveysThemeAnswers.sourceId})::int`,
        themes: sql<number>`count(DISTINCT ${surveysThemeAnswers.themeId})::int`,
      })
      .from(surveysThemeAnswers)
      .innerJoin(surveysThemes, eq(surveysThemes.id, surveysThemeAnswers.themeId))
      .where(
        and(
          eq(surveysThemeAnswers.studyId, studyId),
          sql`${surveysThemes.status} <> 'rejected'`,
          // Answers of counted responses only, as the item's base.
          fileId
            ? sql`${surveysThemeAnswers.sourceId} IN (SELECT ${surveysResponses.sourceId} FROM ${surveysResponses}
                WHERE ${surveysResponses.studyId} = ${studyId} AND ${surveysResponses.formFileId} = ${fileId}
                  AND ${counted} = 'counted')`
            : sql`false`,
        ),
      )
      .groupBy(surveysThemeAnswers.itemId)
    const runs = await db
      .select()
      .from(surveysThemeRuns)
      .where(eq(surveysThemeRuns.studyId, studyId))
      .orderBy(surveysThemeRuns.startedAt)
    const refsOf = (itemId: string | null) =>
      runs
        .filter((r) => itemId === null || r.itemId === itemId)
        .flatMap((r) => Array.from({ length: r.parts + 1 }, (_, part) => themeRunRef(r.id, part)))
    const costs = await deps.costs([
      ...refsOf(null),
      surveyFactsTranslationRef(studyId),
      themesTranslationRef(studyId),
      surveyFactsFindRef(studyId),
    ])
    const sum = (refs: readonly string[]) =>
      refs.reduce<number | null>((n, ref) => {
        const cost = costs.get(ref)
        return n === null || cost === null ? null : n + (cost ?? 0)
      }, 0)
    const last = runs.at(-1)

    const view = {
      counts: { counted: countedN, setAside },
      crossBy: cross?.id ?? null,
      crossable: crossable.map((i) => ({ id: i.id, text: i.text })),
      sections: sections
        .map((s) => ({
          id: s.id,
          title: s.title ?? '',
          kind: s.kind,
          figures: s.items.flatMap((item) => {
            const figure = item.contact ? null : figureItem(item)
            if (!figure) return []
            return [
              {
                itemId: item.id,
                text: item.text,
                kind: figure.kind,
                multiple: figure.kind === 'multiple-choice',
                points: figure.kind === 'likert' ? figure.points : null,
                lowLabel: item.lowLabel ?? null,
                highLabel: item.highLabel ?? null,
                formerWording: formerOf.get(item.id) ?? 0,
                total: columnOf(figure, flat ? flat(item.id, null) : none()),
                columns:
                  cross && crossed
                    ? crossColumns(
                        figure,
                        cross.options ?? [],
                        new Map((cross.options ?? []).map((o) => [o, crossed(item.id, o)])),
                      )
                    : null,
              },
            ]
          }),
        }))
        .filter((s) => s.figures.length > 0),
      openItems: sections.flatMap((s) =>
        s.items
          .filter((i) => i.kind === 'open' && !i.contact)
          .map((i) => {
            const t = themed.find((x) => x.itemId === i.id)
            return {
              id: i.id,
              text: i.text,
              sectionId: s.id,
              answers: flat ? flat(i.id, null).base : 0,
              themed: t?.answers ?? 0,
              themes: t?.themes ?? 0,
              cost: sum(refsOf(i.id)),
            }
          }),
      ),
      run: last
        ? {
            id: last.id,
            itemId: last.itemId,
            state: last.state as 'running' | 'done' | 'failed' | 'stopped',
            parts: last.parts,
            partsDone: last.partsDone,
            answersSent: last.answersSent,
            leftOut: last.leftOut,
            droppedQuotes: last.droppedQuotes,
            droppedThemes: last.droppedThemes,
            failure: last.failure,
            startedAt: last.startedAt.toISOString(),
            finishedAt: last.finishedAt?.toISOString() ?? null,
          }
        : null,
      cost: sum([
        ...refsOf(null),
        surveyFactsTranslationRef(studyId),
        themesTranslationRef(studyId),
        surveyFactsFindRef(studyId),
      ]),
    }
    return ok({ view, ruleVersion: c.value.row?.rule.version ?? null, sections })
  }

  return {
    analysis: async (accountId: string, studyId: string, crossBy: string | null) => {
      const r = await read(accountId, studyId, crossBy)
      return r.ok ? ok(r.value.view) : r
    },
    read,

    /**
     * Spec 029 FR-010, FR-012: today's value of each figure a fact cites, one read per cross; null
     * for a figure that no longer exists (item, option or column gone, empty base).
     */
    figures: async (accountId: string, studyId: string, refs: readonly FigureRef[]) => {
      const crosses = [...new Set(refs.map((r) => r.cross?.itemId ?? null))]
      const reads = new Map<string | null, Awaited<ReturnType<typeof read>>>()
      for (const cross of crosses) reads.set(cross, await read(accountId, studyId, cross))
      const first = reads.get(crosses[0] ?? null)
      if (first && !first.ok && first.error !== 'VALIDATION') return first
      return ok(
        refs.map((ref) => {
          const r = reads.get(ref.cross?.itemId ?? null)
          if (!r?.ok) return null
          const section = r.value.sections.find((s) => s.items.some((i) => i.id === ref.itemId))
          const item = section?.items.find((i) => i.id === ref.itemId)
          const figure = r.value.view.sections
            .flatMap((s) => s.figures)
            .find((f) => f.itemId === ref.itemId)
          if (!section || !item || !figure) return null
          const column = ref.cross
            ? figure.columns?.find((c) => c.option === ref.cross?.option)
            : figure.total
          const found = column ? citedValue(column, ref) : null
          if (!found) return null
          const crossItem = ref.cross
            ? r.value.sections.flatMap((s) => s.items).find((i) => i.id === ref.cross?.itemId)
            : null
          return {
            // Only what points at the figure: a stored snapshot's value or `kept` never carries over.
            snapshot: {
              itemId: ref.itemId,
              measure: ref.measure,
              ...(ref.option === undefined ? {} : { option: ref.option }),
              ...(ref.cross ? { cross: ref.cross } : {}),
              ...found,
              ruleVersion: r.value.ruleVersion,
            },
            context: {
              itemText: item.text,
              crossItemText: crossItem?.text ?? null,
              points: figure.points,
            },
            section: { id: section.id, title: section.title ?? '' },
          }
        }),
      )
    },
  }
}
