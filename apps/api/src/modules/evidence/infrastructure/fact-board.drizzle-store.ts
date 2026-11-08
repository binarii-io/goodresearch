import { and, count, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type {
  FactBoardStatus,
  FactBoardStore,
  StoredFactRow,
} from '../application/fact-board-ports.ts'
import type { FactStatus, Polarity, Translation } from '../domain/facts.ts'
import type { TaskOutcomes } from '../domain/usability-facts.ts'
import {
  evidenceFacts,
  evidenceFactVerbatims,
  evidenceSurveySupports,
  evidenceUsabilitySupports,
} from './schema.ts'

const statusWhere = (status: FactBoardStatus): SQL | undefined =>
  status === 'to-decide'
    ? eq(evidenceFacts.status, 'proposed')
    : status === 'accepted'
      ? inArray(evidenceFacts.status, ['accepted', 'edited'])
      : status === 'rejected'
        ? eq(evidenceFacts.status, 'rejected')
        : undefined

/** LIKE wildcards in a person's search are plain characters. */
const likeOf = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

/**
 * Spec 039: the facts of one study, whatever their source, read in SQL one page at a time with
 * their counts per status (load only what is shown); and a fact's source and study, to decide it.
 */
export const createFactBoardStore = (db: Db): FactBoardStore => ({
  head: async (factId) => {
    const [row] = await db
      .select({
        id: evidenceFacts.id,
        source: evidenceFacts.source,
        studyId: evidenceFacts.studyId,
        version: evidenceFacts.version,
      })
      .from(evidenceFacts)
      .where(eq(evidenceFacts.id, factId))
    return row ? { ...row, source: row.source as StoredFactRow['source'] } : null
  },

  heads: async (factIds) =>
    factIds.length === 0
      ? []
      : (
          await db
            .select({
              id: evidenceFacts.id,
              source: evidenceFacts.source,
              studyId: evidenceFacts.studyId,
              version: evidenceFacts.version,
            })
            .from(evidenceFacts)
            .where(inArray(evidenceFacts.id, [...factIds]))
        ).map((r) => ({ ...r, source: r.source as StoredFactRow['source'] })),

  page: async (studyId, query, size) => {
    const q = query.q?.trim()
    const search = q
      ? or(ilike(evidenceFacts.statementEn, likeOf(q)), ilike(evidenceFacts.statementFr, likeOf(q)))
      : undefined
    const where = and(eq(evidenceFacts.studyId, studyId), statusWhere(query.status), search)
    const rows = await db
      .select({
        fact: evidenceFacts,
        survey: evidenceSurveySupports,
        usability: evidenceUsabilitySupports,
        verbatims: sql<number>`(select count(*)::int from ${evidenceFactVerbatims} where ${evidenceFactVerbatims.factId} = ${evidenceFacts.id})`,
      })
      .from(evidenceFacts)
      .leftJoin(evidenceSurveySupports, eq(evidenceSurveySupports.factId, evidenceFacts.id))
      .leftJoin(evidenceUsabilitySupports, eq(evidenceUsabilitySupports.factId, evidenceFacts.id))
      .where(where)
      // Facts to decide first, then the most recent.
      .orderBy(
        sql`case when ${evidenceFacts.status} = 'proposed' then 0 else 1 end`,
        sql`${evidenceFacts.createdAt} desc`,
        evidenceFacts.id,
      )
      .limit(size)
      .offset((query.page - 1) * size)
    const [total] = await db.select({ n: count() }).from(evidenceFacts).where(where)
    const counts = await db
      .select({ status: evidenceFacts.status, n: count() })
      .from(evidenceFacts)
      .where(and(eq(evidenceFacts.studyId, studyId), search))
      .groupBy(evidenceFacts.status)
    const of = (s: FactStatus) => counts.find((c) => c.status === s)?.n ?? 0
    return {
      total: total?.n ?? 0,
      counts: {
        toDecide: of('proposed'),
        accepted: of('accepted'),
        edited: of('edited'),
        rejected: of('rejected'),
      },
      rows: rows.map(({ fact: f, survey, usability, verbatims }): StoredFactRow => {
        const figure = survey?.figure as { base?: number } | null | undefined
        const share = survey?.themeShare as { base?: number } | null | undefined
        return {
          id: f.id,
          version: f.version,
          studyId: f.studyId,
          source: f.source as StoredFactRow['source'],
          sessionId: f.sessionId,
          status: f.status as FactStatus,
          statement: { en: f.statementEn, fr: f.statementFr },
          translation: f.translation as Translation,
          polarity: f.polarity as Polarity,
          theme: f.themeId ? { id: f.themeId, title: f.themeTitle ?? '' } : null,
          origin: f.origin as 'ai' | 'person',
          evidence: usability
            ? usability.taskId
              ? {
                  kind: 'task',
                  taskId: usability.taskId,
                  outcomes: usability.outcomes as TaskOutcomes,
                  sessions: usability.sessions ?? 0,
                  figuresChanged: usability.figuresChanged,
                }
              : {
                  kind: 'observation',
                  observationId: usability.observationId ?? '',
                  sessionId: f.sessionId ?? '',
                  momentMs: usability.momentMs ?? 0,
                  quote: usability.quote,
                  participant: usability.participant,
                  screenshot: usability.screenshotKey !== null,
                }
            : survey
              ? { kind: 'figure', base: figure?.base ?? share?.base ?? 0 }
              : { kind: 'verbatims', count: verbatims },
        }
      }),
    }
  },
})
