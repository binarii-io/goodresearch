import { ConcurrencyError } from '@goodresearch/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { Executor } from '#platform/db.ts'
import type { QuestionnaireRepository } from '../domain/questionnaire.repository.ts'
import {
  Questionnaire,
  type QuestionnaireContent,
  type QuestionnaireOrigin,
} from '../domain/questionnaire.ts'
import { researchQuestionnaireChecks, researchQuestionnaires } from './schema.ts'

export const drizzleQuestionnaireRepository = (tx: Executor): QuestionnaireRepository => ({
  findByStudy: async (studyId) => {
    const [row] = await tx
      .select()
      .from(researchQuestionnaires)
      .where(eq(researchQuestionnaires.studyId, studyId))
    return row
      ? Questionnaire.fromPersistence({
          ...row,
          content: row.content as QuestionnaireContent,
          origin: row.origin as QuestionnaireOrigin,
        })
      : null
  },

  insert: async (questionnaire) => {
    const inserted = await tx
      .insert(researchQuestionnaires)
      .values({ ...questionnaire.snapshot(), version: 0 })
      .onConflictDoNothing({ target: researchQuestionnaires.studyId })
      .returning({ id: researchQuestionnaires.studyId })
    if (inserted.length === 0) throw new ConcurrencyError()
  },

  update: async (questionnaire) => {
    const p = questionnaire.snapshot()
    const updated = await tx
      .update(researchQuestionnaires)
      .set({
        content: p.content,
        origin: p.origin,
        updatedBy: p.updatedBy,
        updatedAt: p.updatedAt,
        version: sql`${researchQuestionnaires.version} + 1`,
      })
      .where(
        and(
          eq(researchQuestionnaires.studyId, p.studyId),
          eq(researchQuestionnaires.version, p.version),
        ),
      )
      .returning({ id: researchQuestionnaires.studyId })
    if (updated.length === 0) throw new ConcurrencyError()
  },

  mark: async (row) => {
    await tx
      .insert(researchQuestionnaireChecks)
      .values(row)
      .onConflictDoUpdate({
        target: [researchQuestionnaireChecks.studyId, researchQuestionnaireChecks.kind],
        set: {
          people: row.people,
          questionnaireVersion: row.questionnaireVersion,
          markedBy: row.markedBy,
          markedAt: row.markedAt,
        },
      })
  },

  unmark: async (studyId, kind) => {
    await tx
      .delete(researchQuestionnaireChecks)
      .where(
        and(
          eq(researchQuestionnaireChecks.studyId, studyId),
          eq(researchQuestionnaireChecks.kind, kind),
        ),
      )
  },
})
