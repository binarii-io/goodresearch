import { ConcurrencyError, err, newId, ok, type Result } from '@goodresearch/shared'
import { type GuideInput, type GuideOrigin, InterviewGuide } from '../../domain/interview-guide.ts'
import {
  PlannedInterview,
  type PlannedInterviewFields,
  SCHEDULE_LIMIT,
} from '../../domain/planned-interview.ts'
import type {
  InterviewGuideRepository,
  PlannedInterviewRepository,
} from '../../domain/preparation.repository.ts'
import type { StudyRepository } from '../../domain/study.repository.ts'
import type { ResearchCommandDeps, StudyActionGate } from '../ports.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type PreparationError =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'PLANNED_INTERVIEW_NOT_FOUND'
  | 'SCHEDULE_FULL'
  | 'NOT_AN_INTERVIEW_STUDY'

/**
 * Preparation of an interview study (spec 006): its guide and its schedule. Access is the one of
 * every study action: the project's team, then the study's folder (spec 002 FR-010a).
 */
export const makePreparationCommands = (
  deps: ResearchCommandDeps & {
    studies: StudyRepository
    guides: InterviewGuideRepository
    planned: PlannedInterviewRepository
    gate: StudyActionGate
    /**
     * Told after a planned interview changed (spec 009 FR-022): its interview follows. A failure
     * there never undoes the schedule's change.
     */
    plannedChanged?: (
      actor: Actor,
      planned: {
        id: string
        studyId: string
        interviewee: string
        interviewers: string
        scheduledAt: string | null
      },
    ) => Promise<void>
  },
) => {
  const canAct = async (
    actor: Actor,
    studyId: string,
  ): Promise<
    Result<true, 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_AN_INTERVIEW_STUDY'>
  > => {
    const study = await deps.studies.findById(studyId)
    if (!study) return err('STUDY_NOT_FOUND')
    // The team first: outside it, a study's existence and type are not revealed (PR #6 review).
    const access = await deps.teams.getAccessContext(actor.id)
    if (!access || (access.role !== 'admin' && !access.teamIds.includes(study.teamId)))
      return err('STUDY_NOT_FOUND')
    // Only interview studies are prepared with a guide and a schedule (spec 006 edge cases).
    if (study.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY')
    return (await deps.gate.canAct(actor.id, studyId)) ? ok(true) : err('FOLDER_ACCESS_REQUIRED')
  }

  /** A stale version or a first save racing another one. */
  const saved = async (work: () => Promise<void>): Promise<boolean> => {
    try {
      await work()
      return true
    } catch (error) {
      if (error instanceof ConcurrencyError) return false
      throw error
    }
  }

  const loadPlanned = async (actor: Actor, id: string) => {
    const row = await deps.planned.findById(id)
    if (!row) return err('PLANNED_INTERVIEW_NOT_FOUND' as const)
    const allowed = await canAct(actor, row.studyId)
    if (!allowed.ok)
      return allowed.error === 'STUDY_NOT_FOUND'
        ? err('PLANNED_INTERVIEW_NOT_FOUND' as const)
        : allowed
    return ok(row)
  }

  return {
    /**
     * Saves the whole guide against the version seen (`null`: there was none); from the editor or
     * from an applied assistant proposal (`origin`).
     */
    saveGuide: async (c: {
      actor: Actor
      studyId: string
      content: GuideInput
      version: number | null
      origin: GuideOrigin
    }): Promise<Result<{ version: number }, PreparationError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const existing = await deps.guides.findByStudy(c.studyId)
      const change = {
        content: c.content,
        origin: c.origin,
        by: c.actor.id,
        now: deps.clock.now(),
        newId,
      }
      if (!existing) {
        if (c.version !== null) return err('VERSION_CONFLICT')
        const created = InterviewGuide.create({ studyId: c.studyId, ...change })
        if (!created.ok) return created
        return (await saved(() => deps.guides.insert(created.value)))
          ? ok({ version: 0 })
          : err('VERSION_CONFLICT')
      }
      if (existing.version !== c.version) return err('VERSION_CONFLICT')
      const replaced = existing.replace(change)
      if (!replaced.ok) return replaced
      return (await saved(() => deps.guides.update(existing)))
        ? ok({ version: existing.version + 1 })
        : err('VERSION_CONFLICT')
    },

    addPlannedInterview: async (c: {
      actor: Actor
      studyId: string
      fields: PlannedInterviewFields
    }): Promise<Result<{ id: string }, PreparationError>> => {
      const allowed = await canAct(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const created = PlannedInterview.create({
        ...c.fields,
        id: newId(),
        studyId: c.studyId,
        by: c.actor.id,
        now: deps.clock.now(),
      })
      if (!created.ok) return created
      if (!(await deps.planned.insertIfRoom(created.value, SCHEDULE_LIMIT)))
        return err('SCHEDULE_FULL')
      return ok({ id: created.value.id })
    },

    updatePlannedInterview: async (c: {
      actor: Actor
      plannedInterviewId: string
      fields: PlannedInterviewFields
      version: number
    }): Promise<Result<{ version: number }, PreparationError>> => {
      const row = await loadPlanned(c.actor, c.plannedInterviewId)
      if (!row.ok) return row
      if (row.value.version !== c.version) return err('VERSION_CONFLICT')
      const edited = row.value.edit(c.fields, deps.clock.now())
      if (!edited.ok) return edited
      if (!(await saved(() => deps.planned.update(row.value)))) return err('VERSION_CONFLICT')
      const p = row.value.snapshot()
      await deps
        .plannedChanged?.(c.actor, {
          id: p.id,
          studyId: p.studyId,
          interviewee: p.interviewee,
          interviewers: p.interviewers,
          scheduledAt: p.scheduledAt?.toISOString() ?? null,
        })
        .catch(() => undefined)
      return ok({ version: c.version + 1 })
    },

    deletePlannedInterview: async (c: {
      actor: Actor
      plannedInterviewId: string
    }): Promise<Result<void, PreparationError>> => {
      const row = await loadPlanned(c.actor, c.plannedInterviewId)
      if (!row.ok) return row
      await deps.planned.delete(row.value.id)
      return ok(undefined)
    },
  }
}

export type PreparationCommands = ReturnType<typeof makePreparationCommands>
