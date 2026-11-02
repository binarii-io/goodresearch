import { ConcurrencyError, err, newId, ok, type Result } from '@goodresearch/shared'
import type {
  QuestionnaireRepository,
  ReadinessKind,
} from '../../domain/questionnaire.repository.ts'
import {
  Questionnaire,
  type QuestionnaireInput,
  type QuestionnaireOrigin,
} from '../../domain/questionnaire.ts'
import type { StudyRepository } from '../../domain/study.repository.ts'
import type { ResearchCommandDeps, StudyActionGate } from '../ports.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type QuestionnaireError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'NOT_A_SURVEY_STUDY'
  | 'QUESTIONNAIRE_NOT_FOUND'

/** The questionnaire of a survey study (spec 027); same access as every study action. */
export const makeQuestionnaireCommands = (
  deps: ResearchCommandDeps & {
    studies: StudyRepository
    questionnaires: QuestionnaireRepository
    gate: StudyActionGate
  },
) => {
  const canAct = async (
    actor: Actor,
    studyId: string,
  ): Promise<Result<true, 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_A_SURVEY_STUDY'>> => {
    const study = await deps.studies.findById(studyId)
    if (!study) return err('STUDY_NOT_FOUND')
    const access = await deps.teams.getAccessContext(actor.id)
    if (!access || (access.role !== 'admin' && !access.teamIds.includes(study.teamId)))
      return err('STUDY_NOT_FOUND')
    if (study.type !== 'survey') return err('NOT_A_SURVEY_STUDY')
    return (await deps.gate.canAct(actor.id, studyId)) ? ok(true) : err('FOLDER_ACCESS_REQUIRED')
  }

  const saved = async (work: () => Promise<void>): Promise<boolean> => {
    try {
      await work()
      return true
    } catch (error) {
      if (error instanceof ConcurrencyError) return false
      throw error
    }
  }

  return {
    /**
     * Saves the whole questionnaire against the version seen (`null`: there was none), from the
     * editor, an applied assistant proposal or accepted changes of the form (`origin`).
     */
    saveQuestionnaire: async (c: {
      actor: Actor
      studyId: string
      content: QuestionnaireInput
      version: number | null
      origin: QuestionnaireOrigin
    }): Promise<Result<{ version: number }, QuestionnaireError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const existing = await deps.questionnaires.findByStudy(c.studyId)
      const change = {
        content: c.content,
        origin: c.origin,
        by: c.actor.id,
        now: deps.clock.now(),
        newId,
      }
      if (!existing) {
        if (c.version !== null) return err('VERSION_CONFLICT')
        const created = Questionnaire.create({ studyId: c.studyId, ...change })
        if (!created.ok) return created
        return (await saved(() => deps.questionnaires.insert(created.value)))
          ? ok({ version: 0 })
          : err('VERSION_CONFLICT')
      }
      if (existing.version !== c.version) return err('VERSION_CONFLICT')
      const replaced = existing.replace(change)
      if (!replaced.ok) return replaced
      return (await saved(() => deps.questionnaires.update(existing)))
        ? ok({ version: existing.version + 1 })
        : err('VERSION_CONFLICT')
    },

    /** A person says a check was done, on the current version (US6). It blocks nothing. */
    markReadiness: async (c: {
      actor: Actor
      studyId: string
      kind: ReadinessKind
      people: number | null
    }): Promise<Result<void, QuestionnaireError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const existing = await deps.questionnaires.findByStudy(c.studyId)
      if (!existing) return err('QUESTIONNAIRE_NOT_FOUND')
      if (c.kind === 'pre-test' ? c.people === null : c.people !== null) return err('VALIDATION')
      await deps.questionnaires.mark({
        studyId: c.studyId,
        kind: c.kind,
        people: c.people,
        questionnaireVersion: existing.version,
        markedBy: c.actor.id,
        markedAt: deps.clock.now(),
      })
      return ok(undefined)
    },

    unmarkReadiness: async (c: {
      actor: Actor
      studyId: string
      kind: ReadinessKind
    }): Promise<Result<void, QuestionnaireError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      await deps.questionnaires.unmark(c.studyId, c.kind)
      return ok(undefined)
    },
  }
}

export type QuestionnaireCommands = ReturnType<typeof makeQuestionnaireCommands>
