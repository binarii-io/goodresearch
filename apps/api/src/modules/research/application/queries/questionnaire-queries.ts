import type { Questionnaire, QuestionnaireDraft } from '@goodresearch/contracts'
import { err, ok, type Result } from '@goodresearch/shared'
import { eq } from 'drizzle-orm'
import { auth_users } from '#platform/auth/auth-schema.ts'
import type { Db } from '#platform/db.ts'
import type { QuestionnaireContent } from '../../domain/questionnaire.ts'
import {
  checkItem,
  checkSections,
  estimateMinutes,
  randomisationOf,
} from '../../domain/questionnaire-checks.ts'
import {
  researchQuestionnaireChecks,
  researchQuestionnaires,
  researchStudies,
} from '../../infrastructure/schema.ts'
import type { StudyActionGate, TeamDirectory } from '../ports.ts'

type Denied = 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_A_SURVEY_STUDY'

/** What the app's rules say of a questionnaire, for the screen and the assistant's card. */
export const checksOf = (sections: QuestionnaireContent['sections']) => ({
  items: Object.fromEntries(
    sections.flatMap((s) => s.items.map((i) => [i.id, checkItem(i)] as const)),
  ),
  whole: checkSections(sections),
})

/** The rules on a draft of the assistant, before it has ids (FR-007). */
export const checkDraft = (draft: QuestionnaireDraft) => {
  const sections = draft.sections.map((s, i) => ({
    ...s,
    id: String(i),
    items: s.items.map((item, j) => ({ ...item, id: `${i}-${j}` })),
  })) as QuestionnaireContent['sections']
  return {
    items: sections.flatMap((s) => s.items.map((i) => ({ text: i.text, flags: checkItem(i) }))),
    whole: checkSections(sections),
    estimatedMinutes: estimateMinutes(sections),
  }
}

/** Reads of a study's questionnaire (spec 027), with the same gates as the guide. */
export const makeQuestionnaireQueries = (deps: {
  db: Db
  teams: TeamDirectory
  gate: StudyActionGate
}) => {
  const { db } = deps

  const studyOf = async (studyId: string) => {
    const [row] = await db
      .select({ teamId: researchStudies.teamId, type: researchStudies.type })
      .from(researchStudies)
      .where(eq(researchStudies.id, studyId))
    return row ?? null
  }

  const questionnaireOf = async (studyId: string): Promise<Questionnaire | null> => {
    const [row] = await db
      .select({ q: researchQuestionnaires, updatedByName: auth_users.name })
      .from(researchQuestionnaires)
      .leftJoin(auth_users, eq(auth_users.id, researchQuestionnaires.updatedBy))
      .where(eq(researchQuestionnaires.studyId, studyId))
    if (!row) return null
    const content = row.q.content as QuestionnaireContent
    const marks = await db
      .select({ mark: researchQuestionnaireChecks, name: auth_users.name })
      .from(researchQuestionnaireChecks)
      .leftJoin(auth_users, eq(auth_users.id, researchQuestionnaireChecks.markedBy))
      .where(eq(researchQuestionnaireChecks.studyId, studyId))
    return {
      studyId,
      content: content as Questionnaire['content'],
      origin: row.q.origin as Questionnaire['origin'],
      // An anonymised (deleted) account has an empty name.
      updatedBy: row.updatedByName === null ? null : { name: row.updatedByName },
      updatedAt: row.q.updatedAt.toISOString(),
      version: row.q.version,
      checks: checksOf(content.sections),
      estimatedMinutes: estimateMinutes(content.sections),
      randomisation: randomisationOf(content),
      readiness: marks.map((m) => ({
        kind: m.mark.kind as 'review' | 'pre-test',
        people: m.mark.people,
        by: m.name === null ? null : { name: m.name },
        at: m.mark.markedAt.toISOString(),
        changedSince: m.mark.questionnaireVersion !== row.q.version,
      })),
    }
  }

  return {
    /** Spec 026: like the guide, it holds no name: every active member reads it. */
    getQuestionnaire: async (
      accountId: string,
      studyId: string,
    ): Promise<Result<Questionnaire | null, Denied>> => {
      const study = await studyOf(studyId)
      const access = await deps.teams.getAccessContext(accountId)
      if (!study || !access) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canRead(accountId, studyId))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.type !== 'survey') return err('NOT_A_SURVEY_STUDY')
      const questionnaire = await questionnaireOf(studyId)
      const reader = access.role !== 'admin' && !access.teamIds.includes(study.teamId)
      // Who wrote and checked it stays with the team.
      return ok(
        questionnaire && reader
          ? {
              ...questionnaire,
              updatedBy: null,
              readiness: questionnaire.readiness.map((m) => ({ ...m, by: null })),
            }
          : questionnaire,
      )
    },

    /** What the assistant may know: `null` without the right to change, or another type. */
    questionnaireForAssistant: async (
      accountId: string,
      studyId: string,
    ): Promise<{
      version: number | null
      content: Questionnaire['content'] | null
      checksDone: boolean
    } | null> => {
      const study = await studyOf(studyId)
      const access = await deps.teams.getAccessContext(accountId)
      if (!study || !access || study.type !== 'survey') return null
      if (access.role !== 'admin' && !access.teamIds.includes(study.teamId)) return null
      if (!(await deps.gate.canAct(accountId, studyId))) return null
      const found = await questionnaireOf(studyId)
      if (!found) return { version: null, content: null, checksDone: false }
      const valid = found.readiness.filter((m) => !m.changedSince)
      return {
        version: found.version,
        content: found.content,
        checksDone: valid.length === 2,
      }
    },
  }
}

export type QuestionnaireQueries = ReturnType<typeof makeQuestionnaireQueries>
