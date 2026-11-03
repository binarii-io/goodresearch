import { and, count, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { FactStatus, Polarity, Translation } from '../domain/facts.ts'
import type { FigureSnapshot, SurveyFact, SurveySupport } from '../domain/survey-facts.ts'
import { evidenceFacts, evidenceSurveySupports } from './schema.ts'

export type SurveyFactStore = {
  insert(fact: SurveyFact, at: Date): Promise<void>
  get(id: string): Promise<SurveyFact | null>
  /** Saved if still at version `expected`. */
  save(fact: SurveyFact, expected: number): Promise<'ok' | 'conflict'>
  /** One page of a study's facts, newest first; `to-decide` is `proposed`. */
  page(
    studyId: string,
    status: 'to-decide' | 'accepted' | 'rejected' | 'all',
    page: number,
    size: number,
  ): Promise<{ facts: SurveyFact[]; total: number }>
  counts(studyId: string): Promise<{ status: FactStatus; count: number }[]>
  /** Not rejected, for the project's insights. */
  allOf(studyId: string): Promise<SurveyFact[]>
  ofStudies(studyIds: readonly string[]): Promise<SurveyFact[]>
  byIds(ids: readonly string[]): Promise<SurveyFact[]>
}

type FactRow = typeof evidenceFacts.$inferSelect
type SupportRow = typeof evidenceSurveySupports.$inferSelect

const supportOf = (s: SupportRow): SurveySupport =>
  s.kind === 'figure'
    ? { kind: 'figure', itemId: s.itemId, figure: s.figure as FigureSnapshot }
    : {
        kind: 'theme',
        itemId: s.itemId,
        themeId: s.themeId ?? '',
        share: s.themeShare as { answers: number; base: number },
        quotes: s.quotes as string[],
      }

const factOf = (r: FactRow, s: SupportRow): SurveyFact => ({
  id: r.id,
  studyId: r.studyId,
  statement: { en: r.statementEn, fr: r.statementFr },
  translation: r.translation as Translation,
  polarity: r.polarity as Polarity,
  theme: r.themeId ? { id: r.themeId, title: r.themeTitle ?? '' } : null,
  support: supportOf(s),
  origin: r.origin as 'ai' | 'person',
  status: r.status as FactStatus,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  version: r.version,
  keptAt: s.keptAt,
})

const factRow = (f: SurveyFact) => ({
  statementEn: f.statement.en,
  statementFr: f.statement.fr,
  translation: f.translation,
  polarity: f.polarity,
  themeId: f.theme?.id ?? null,
  themeTitle: f.theme?.title ?? null,
  status: f.status,
  decidedBy: f.decidedBy,
  decidedAt: f.decidedAt,
  version: f.version,
})

const supportRow = (f: SurveyFact) => ({
  itemId: f.support.itemId,
  kind: f.support.kind,
  figure: f.support.kind === 'figure' ? f.support.figure : null,
  themeId: f.support.kind === 'theme' ? f.support.themeId : null,
  themeShare: f.support.kind === 'theme' ? f.support.share : null,
  quotes: f.support.kind === 'theme' ? [...f.support.quotes] : [],
  keptAt: f.keptAt,
})

/** Spec 029: survey facts, in the facts table with source `survey` and their support. */
export const createSurveyFactStore = (db: Db): SurveyFactStore => {
  const survey = eq(evidenceFacts.source, 'survey')
  const read = async (where: ReturnType<typeof eq>, limit?: { size: number; offset: number }) => {
    const query = db
      .select({ fact: evidenceFacts, support: evidenceSurveySupports })
      .from(evidenceFacts)
      .innerJoin(evidenceSurveySupports, eq(evidenceSurveySupports.factId, evidenceFacts.id))
      .where(and(survey, where))
      .orderBy(sql`${evidenceFacts.createdAt} DESC`, evidenceFacts.id)
    const rows = limit ? await query.limit(limit.size).offset(limit.offset) : await query
    return rows.map((r) => factOf(r.fact, r.support))
  }
  const statusWhere = (status: 'to-decide' | 'accepted' | 'rejected' | 'all') =>
    status === 'to-decide'
      ? eq(evidenceFacts.status, 'proposed')
      : status === 'accepted'
        ? inArray(evidenceFacts.status, ['accepted', 'edited'])
        : status === 'rejected'
          ? eq(evidenceFacts.status, 'rejected')
          : sql`true`
  return {
    insert: async (fact, at) => {
      await db.transaction(async (tx) => {
        await tx.insert(evidenceFacts).values({
          id: fact.id,
          source: 'survey',
          sessionId: null,
          studyId: fact.studyId,
          origin: fact.origin,
          runId: null,
          createdAt: at,
          ...factRow(fact),
        })
        await tx.insert(evidenceSurveySupports).values({ factId: fact.id, ...supportRow(fact) })
      })
    },
    get: async (id) => (await read(eq(evidenceFacts.id, id)))[0] ?? null,
    save: async (fact, expected) =>
      db.transaction(async (tx) => {
        const done = await tx
          .update(evidenceFacts)
          .set(factRow(fact))
          .where(and(eq(evidenceFacts.id, fact.id), eq(evidenceFacts.version, expected), survey))
          .returning({ id: evidenceFacts.id })
        if (done.length === 0) return 'conflict' as const
        await tx
          .update(evidenceSurveySupports)
          .set(supportRow(fact))
          .where(eq(evidenceSurveySupports.factId, fact.id))
        return 'ok' as const
      }),
    page: async (studyId, status, page, size) => {
      const where = and(eq(evidenceFacts.studyId, studyId), statusWhere(status)) as ReturnType<
        typeof eq
      >
      const [facts, [total]] = await Promise.all([
        read(where, { size, offset: (page - 1) * size }),
        db.select({ n: count() }).from(evidenceFacts).where(and(survey, where)),
      ])
      return { facts, total: total?.n ?? 0 }
    },
    counts: async (studyId) =>
      (
        await db
          .select({ status: evidenceFacts.status, count: count() })
          .from(evidenceFacts)
          .where(and(survey, eq(evidenceFacts.studyId, studyId)))
          .groupBy(evidenceFacts.status)
      ).map((r) => ({ status: r.status as FactStatus, count: r.count })),
    allOf: (studyId) => read(eq(evidenceFacts.studyId, studyId)),
    ofStudies: async (studyIds) =>
      studyIds.length === 0
        ? []
        : read(
            and(
              inArray(evidenceFacts.studyId, [...studyIds]),
              ne(evidenceFacts.status, 'rejected'),
            ) as ReturnType<typeof eq>,
          ),
    byIds: async (ids) => (ids.length === 0 ? [] : read(inArray(evidenceFacts.id, [...ids]))),
  }
}
