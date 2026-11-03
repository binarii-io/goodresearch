import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Db } from '#platform/db.ts'
import type { ReadingRow, RuleRow, SurveysStore } from '../application/ports.ts'
import type { Accepted } from '../domain/responses.ts'
import {
  surveysItemWordings,
  surveysReadings,
  surveysResponses,
  surveysTargetRules,
} from './schema.ts'

const CHUNK = 500

const chunks = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) =>
    items.slice(i * CHUNK, (i + 1) * CHUNK),
  )

const readingSet = (row: ReadingRow) => ({
  status: row.status,
  readAt: row.readAt,
  readBy: row.readBy,
  unknownQuestions: row.unknownQuestions,
  unknownValues: row.unknownValues,
})

export const createSurveysStore = (db: Db): SurveysStore => ({
  reading: async (studyId) => {
    const [row] = await db
      .select()
      .from(surveysReadings)
      .where(eq(surveysReadings.studyId, studyId))
    return row ? { ...row, status: row.status as ReadingRow['status'] } : null
  },

  markFailed: async (studyId, at, by) => {
    await db
      .insert(surveysReadings)
      .values({
        studyId,
        status: 'failed',
        readAt: at,
        readBy: by,
        unknownQuestions: 0,
        unknownValues: 0,
      })
      .onConflictDoUpdate({ target: surveysReadings.studyId, set: { status: 'failed' } })
  },

  replaceResponses: async (c) => {
    await db.transaction(async (tx) => {
      for (const part of chunks(c.responses))
        await tx
          .insert(surveysResponses)
          .values(
            part.map((r) => ({
              studyId: c.studyId,
              sourceId: r.sourceId,
              formFileId: c.formFileId,
              submittedAt: r.submittedAt,
              consent: r.consent,
              answers: r.answers,
              readAt: c.readAt,
            })),
          )
          .onConflictDoUpdate({
            target: [surveysResponses.studyId, surveysResponses.sourceId],
            set: {
              formFileId: c.formFileId,
              submittedAt: sql`excluded.submitted_at`,
              consent: sql`excluded.consent`,
              answers: sql`excluded.answers`,
              readAt: c.readAt,
            },
          })
      if (c.complete) {
        const of = and(
          eq(surveysResponses.studyId, c.studyId),
          eq(surveysResponses.formFileId, c.formFileId),
        )
        const seen = c.responses.map((r) => r.sourceId)
        if (seen.length === 0) await tx.delete(surveysResponses).where(of)
        else {
          const gone = await tx
            .select({ id: surveysResponses.sourceId })
            .from(surveysResponses)
            .where(
              and(
                of,
                seen.length <= CHUNK ? notInArray(surveysResponses.sourceId, seen) : undefined,
              ),
            )
          const keep = new Set(seen)
          for (const part of chunks(gone.map((g) => g.id).filter((id) => !keep.has(id))))
            await tx
              .delete(surveysResponses)
              .where(and(of, inArray(surveysResponses.sourceId, part)))
        }
      }
      await tx
        .insert(surveysReadings)
        .values(c.reading)
        .onConflictDoUpdate({ target: surveysReadings.studyId, set: readingSet(c.reading) })
    })
  },

  rule: async (studyId) => {
    const [row] = await db
      .select()
      .from(surveysTargetRules)
      .where(eq(surveysTargetRules.studyId, studyId))
    return row
      ? { ...row, accepted: row.accepted as Accepted, origin: row.origin as RuleRow['origin'] }
      : null
  },

  saveRule: async (row, expected) => {
    const { studyId, ...fields } = row
    if (expected === null) {
      const inserted = await db
        .insert(surveysTargetRules)
        .values(row)
        .onConflictDoNothing()
        .returning({ id: surveysTargetRules.studyId })
      return inserted.length > 0
    }
    const updated = await db
      .update(surveysTargetRules)
      .set(fields)
      .where(and(eq(surveysTargetRules.studyId, studyId), eq(surveysTargetRules.version, expected)))
      .returning({ id: surveysTargetRules.studyId })
    return updated.length > 0
  },

  count: async (studyId, formFileId) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(surveysResponses)
      .where(
        and(eq(surveysResponses.studyId, studyId), eq(surveysResponses.formFileId, formFileId)),
      )
    return row?.n ?? 0
  },

  recordWordings: async (studyId, wordings, until) => {
    if (wordings.length)
      await db
        .insert(surveysItemWordings)
        .values(wordings.map((w) => ({ studyId, ...w, until })))
        .onConflictDoNothing()
  },
})
