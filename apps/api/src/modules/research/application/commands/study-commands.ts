import { ConcurrencyError, err, newId, ok, type Result } from '@goodresearch/shared'
import type { StudyRepository } from '../../domain/study.repository.ts'
import { Study } from '../../domain/study.ts'
import type { ResearchCommandDeps, StudyActionGate } from '../ports.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type StudyCommandError =
  | 'PROJECT_NOT_FOUND'
  | 'STUDY_NOT_FOUND'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'FOLDER_ACCESS_REQUIRED'

/** Study commands (spec 002 US1). Access: the project's team, then the study's folder (FR-010a). */
export const makeStudyCommands = (
  deps: ResearchCommandDeps & { studies: StudyRepository; gate: StudyActionGate },
) => {
  const projectVisible = async (actorId: string, projectId: string): Promise<boolean> => {
    const access = await deps.teams.getAccessContext(actorId)
    const project = await deps.uow(({ projects }) => projects.findById(projectId))
    return Boolean(
      access && project && (access.role === 'admin' || access.teamIds.includes(project.teamId)),
    )
  }

  const loadVisible = async (actorId: string, studyId: string): Promise<Study | null> => {
    const study = await deps.studies.findById(studyId)
    return study && (await projectVisible(actorId, study.projectId)) ? study : null
  }

  return {
    createStudy: async (c: {
      actor: Actor
      projectId: string
      name: string
      type: string
    }): Promise<Result<{ id: string }, StudyCommandError>> => {
      if (!(await projectVisible(c.actor.id, c.projectId))) return err('PROJECT_NOT_FOUND')
      const created = Study.create({
        id: newId(),
        projectId: c.projectId,
        name: c.name,
        type: c.type,
        createdBy: c.actor.id,
        now: deps.clock.now(),
      })
      if (!created.ok) return created
      await deps.studies.save(created.value)
      return ok({ id: created.value.id })
    },

    renameStudy: async (c: {
      actor: Actor
      studyId: string
      name: string
      version: number
    }): Promise<Result<{ version: number }, StudyCommandError>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(c.actor.id, study.id))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.version !== c.version) return err('VERSION_CONFLICT')
      const renamed = study.rename(c.name, deps.clock.now())
      if (!renamed.ok) return renamed
      try {
        await deps.studies.save(study)
      } catch (error) {
        if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
        throw error
      }
      return ok({ version: c.version + 1 })
    },

    /** Spec 009 FR-013: names and titles of the interviews use pseudonyms, or not. */
    setAnonymisation: async (c: {
      actor: Actor
      studyId: string
      anonymised: boolean
      version: number
    }): Promise<Result<{ version: number }, StudyCommandError>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(c.actor.id, study.id))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.version !== c.version) return err('VERSION_CONFLICT')
      study.setAnonymised(c.anonymised, deps.clock.now())
      try {
        await deps.studies.save(study)
      } catch (error) {
        if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
        throw error
      }
      return ok({ version: c.version + 1 })
    },

    /** Admins may delete without folder access, so a study is never stuck (FR-010b). */
    deleteStudy: async (c: {
      actor: Actor
      studyId: string
    }): Promise<Result<void, StudyCommandError>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (c.actor.role !== 'admin' && !(await deps.gate.canAct(c.actor.id, study.id)))
        return err('FOLDER_ACCESS_REQUIRED')
      await deps.studies.delete(study.id)
      return ok(undefined)
    },
  }
}

export type StudyCommands = ReturnType<typeof makeStudyCommands>
