import { err, ok, type Result } from '@goodresearch/shared'
import { and, asc, desc, eq, ne, type SQL, sql } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import { type Accepted, acceptedOf, type ResponseState, validRule } from '../../domain/responses.ts'
import {
  surveysItemWordings,
  surveysReadings,
  surveysResponses,
  surveysTargetRules,
} from '../../infrastructure/schema.ts'
import type { SurveysDeps } from '../ports.ts'

const PAGE_SIZE = 50

/** `stateOf` in SQL (spec 028 research R4): an integration test compares the two. */
export const stateSql = (accepted: Accepted): SQL<ResponseState> => {
  const rule = Object.entries(accepted)
  const answers = surveysResponses.answers
  const notAnswered = rule.map(
    ([item]) => sql`coalesce(jsonb_array_length(${answers}->${item}), 0) = 0`,
  )
  const passes = rule.map(
    ([item, ok]) =>
      sql`jsonb_exists_any(${answers}->${item}, ARRAY[${sql.join(
        ok.map((v) => sql`${v}`),
        sql`, `,
      )}]::text[])`,
  )
  return sql<ResponseState>`CASE
    WHEN ${surveysResponses.consent} = 'refused' THEN 'refused-consent'
    WHEN ${notAnswered.length ? sql.join(notAnswered, sql` OR `) : sql`false`} THEN 'profile-not-answered'
    WHEN ${passes.length ? sql.join(passes, sql` AND `) : sql`true`} THEN 'counted'
    ELSE 'out-of-target' END`
}

/** What a person reads of a study's responses (spec 028); counts and pages are SQL. */
export const makeResponseQueries = (deps: SurveysDeps & { db: Db }) => {
  const { db } = deps

  const context = async (accountId: string, studyId: string) => {
    const questionnaire = await deps.questionnaire(accountId, studyId)
    if (!questionnaire.ok) return questionnaire
    const form = await deps.form(studyId)
    const [row] = await db
      .select({ rule: surveysTargetRules, name: auth_users.name })
      .from(surveysTargetRules)
      .leftJoin(auth_users, eq(auth_users.id, surveysTargetRules.updatedBy))
      .where(eq(surveysTargetRules.studyId, studyId))
    const sections = questionnaire.value?.content.sections ?? []
    const { accepted, stale } = acceptedOf((row?.rule.accepted ?? {}) as Accepted, sections)
    return ok({ questionnaire: questionnaire.value, form, sections, accepted, stale, row })
  }

  const counts = async (studyId: string, fileId: string | null, accepted: Accepted) => {
    if (!fileId)
      return { total: 0, counted: 0, outOfTarget: 0, profileNotAnswered: 0, refusedConsent: 0 }
    const rows = await db
      .select({ state: stateSql(accepted), n: sql<number>`count(*)::int` })
      .from(surveysResponses)
      .where(and(eq(surveysResponses.studyId, studyId), eq(surveysResponses.formFileId, fileId)))
      .groupBy(sql`1`)
    const of = (state: ResponseState) => rows.find((r) => r.state === state)?.n ?? 0
    return {
      total: rows.reduce((sum, r) => sum + r.n, 0),
      counted: of('counted'),
      outOfTarget: of('out-of-target'),
      profileNotAnswered: of('profile-not-answered'),
      refusedConsent: of('refused-consent'),
    }
  }

  return {
    summary: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<unknown, string> & object> => {
      const c = await context(accountId, studyId)
      if (!c.ok) return c
      const fileId = c.value.form?.fileId ?? null
      const [reading] = await db
        .select()
        .from(surveysReadings)
        .where(eq(surveysReadings.studyId, studyId))
      const [former] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(surveysResponses)
        .where(
          and(
            eq(surveysResponses.studyId, studyId),
            ...(fileId ? [ne(surveysResponses.formFileId, fileId)] : []),
          ),
        )
      const r = c.value.row
      return ok({
        counts: await counts(studyId, fileId, c.value.accepted),
        fromFormerForm: former?.n ?? 0,
        target: c.value.questionnaire?.content.framing.targetResponses ?? null,
        reading: reading
          ? {
              status: reading.status as 'done' | 'failed' | 'stopped',
              readAt: reading.readAt.toISOString(),
              unknownQuestions: reading.unknownQuestions,
              unknownValues: reading.unknownValues,
            }
          : null,
        rule: r
          ? {
              accepted: r.rule.accepted as Record<string, string[]>,
              version: r.rule.version,
              stale: c.value.stale,
              origin: r.rule.origin as 'person' | 'assistant',
              updatedBy: r.name === null ? null : { name: r.name },
              updatedAt: r.rule.updatedAt.toISOString(),
            }
          : null,
        filterable: c.value.sections
          .filter((s) => s.kind === 'profiling')
          .flatMap((s) => s.items)
          .filter((i) => i.kind === 'single-choice' || i.kind === 'multiple-choice')
          .map((i) => ({ id: i.id, text: i.text, options: [...(i.options ?? [])] })),
      })
    },

    /** Counts only, for the assistant: never an answer (FR-012, FR-013). */
    progress: async (accountId: string, studyId: string) => {
      const c = await context(accountId, studyId)
      if (!c.ok) return c
      return ok({
        counts: await counts(studyId, c.value.form?.fileId ?? null, c.value.accepted),
        target: c.value.questionnaire?.content.framing.targetResponses ?? null,
        ruleVersion: c.value.row?.rule.version ?? null,
      })
    },

    /** What a rule would set aside, for its card. */
    previewRule: async (accountId: string, studyId: string, accepted: Accepted) => {
      const c = await context(accountId, studyId)
      if (!c.ok) return c
      if (!validRule(accepted, c.value.sections)) return err('VALIDATION')
      const seen = await counts(studyId, c.value.form?.fileId ?? null, accepted)
      const items = c.value.sections.flatMap((s) => s.items)
      return ok({
        setAside: seen.outOfTarget + seen.profileNotAnswered,
        total: seen.total,
        items: Object.entries(accepted).map(([id, values]) => ({
          text: items.find((i) => i.id === id)?.text ?? id,
          accepted: [...values],
        })),
      })
    },

    page: async (
      accountId: string,
      studyId: string,
      query: { state?: ResponseState | undefined; page: number },
    ) => {
      const c = await context(accountId, studyId)
      if (!c.ok) return c
      const fileId = c.value.form?.fileId
      if (!fileId) return ok({ items: [], total: 0, page: query.page, pageSize: PAGE_SIZE })
      const state = stateSql(c.value.accepted)
      const where = and(
        eq(surveysResponses.studyId, studyId),
        eq(surveysResponses.formFileId, fileId),
        query.state ? sql`(${state}) = ${query.state}` : undefined,
      )
      const [total] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(surveysResponses)
        .where(where)
      const rows = await db
        .select({
          id: surveysResponses.sourceId,
          submittedAt: surveysResponses.submittedAt,
          state,
        })
        .from(surveysResponses)
        .where(where)
        .orderBy(desc(surveysResponses.submittedAt), asc(surveysResponses.sourceId))
        .limit(PAGE_SIZE)
        .offset((query.page - 1) * PAGE_SIZE)
      return ok({
        items: rows.map((r) => ({ ...r, submittedAt: r.submittedAt.toISOString() })),
        total: total?.n ?? 0,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
    },

    detail: async (accountId: string, studyId: string, responseId: string) => {
      const c = await context(accountId, studyId)
      if (!c.ok) return c
      const fileId = c.value.form?.fileId
      if (!fileId) return err('RESPONSE_NOT_FOUND')
      const [row] = await db
        .select({
          submittedAt: surveysResponses.submittedAt,
          answers: surveysResponses.answers,
          state: stateSql(c.value.accepted),
        })
        .from(surveysResponses)
        .where(
          and(
            eq(surveysResponses.studyId, studyId),
            eq(surveysResponses.formFileId, fileId),
            eq(surveysResponses.sourceId, responseId),
          ),
        )
      if (!row) return err('RESPONSE_NOT_FOUND')
      const wordings = await db
        .select()
        .from(surveysItemWordings)
        .where(eq(surveysItemWordings.studyId, studyId))
        .orderBy(asc(surveysItemWordings.until))
      const answers = row.answers as Record<string, string[]>
      return ok({
        id: responseId,
        submittedAt: row.submittedAt.toISOString(),
        state: row.state,
        answers: c.value.sections
          .flatMap((s) => s.items)
          .filter((i) => !i.contact)
          .map((i) => ({
            itemId: i.id,
            text: i.text,
            // The first wording replaced after this response was the one it answered.
            formerText:
              wordings.find((w) => w.itemId === i.id && w.until > row.submittedAt)?.text ?? null,
            values: answers[i.id] ?? [],
          })),
      })
    },
  }
}

export type ResponseQueries = ReturnType<typeof makeResponseQueries>
