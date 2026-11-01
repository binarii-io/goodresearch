import { ConcurrencyError, err, newId, ok, type Result } from '@goodresearch/shared'
import type { StudyRepository } from '../../domain/study.repository.ts'
import { Study, type TextAnalysed } from '../../domain/study.ts'
import { canUseTeam } from '../access.ts'
import type { ProjectRunGate, ResearchCommandDeps, StudyActionGate } from '../ports.ts'

type Actor = { readonly id: string; readonly role: 'admin' | 'member' }

export type StudyCommandError =
  | 'PROJECT_NOT_FOUND'
  | 'STUDY_NOT_FOUND'
  | 'VALIDATION'
  | 'VERSION_CONFLICT'
  | 'FOLDER_ACCESS_REQUIRED'

export type StudyLinkError =
  | 'PROJECT_NOT_FOUND'
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'DIFFERENT_TEAM'
  | 'ALREADY_LINKED'
  | 'NOT_LINKED'
  | 'SYNTHESIS_RUNNING'

/** Study commands (spec 002 US1). Access: the study's team, then its folder (FR-010a). */
export const makeStudyCommands = (
  deps: ResearchCommandDeps & {
    studies: StudyRepository
    gate: StudyActionGate
    runs: ProjectRunGate
  },
) => {
  const inTeam = async (actorId: string, teamId: string): Promise<boolean> => {
    const access = await deps.teams.getAccessContext(actorId)
    return Boolean(access && (access.role === 'admin' || access.teamIds.includes(teamId)))
  }

  const projectVisible = async (actorId: string, projectId: string) => {
    const project = await deps.uow(({ projects }) => projects.findById(projectId))
    return project && (await inTeam(actorId, project.teamId)) ? project : null
  }

  const loadVisible = async (actorId: string, studyId: string): Promise<Study | null> => {
    const study = await deps.studies.findById(studyId)
    return study && (await inTeam(actorId, study.teamId)) ? study : null
  }

  /**
   * Changes a study's links. Someone else may have changed the study meanwhile (another link, its
   * name): the change is tried again on what it is now, so the error is the true one.
   */
  const changeLinks = async (
    studyId: string,
    change: (study: Study) => Result<void, StudyLinkError>,
  ): Promise<Result<void, StudyLinkError>> => {
    for (let attempt = 0; ; attempt++) {
      const study = await deps.studies.findById(studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      const changed = change(study)
      if (!changed.ok) return changed
      try {
        await deps.studies.save(study)
        return ok(undefined)
      } catch (error) {
        if (!(error instanceof ConcurrencyError) || attempt >= 2) throw error
      }
    }
  }

  return {
    createStudy: async (c: {
      actor: Actor
      projectId: string
      name: string
      type: string
      /** Spec 021: the card's; otherwise a copy of the project's. */
      goal?: string | undefined
    }): Promise<Result<{ id: string }, StudyCommandError>> => {
      const project = await projectVisible(c.actor.id, c.projectId)
      if (!project) return err('PROJECT_NOT_FOUND')
      const created = Study.create({
        id: newId(),
        teamId: project.teamId,
        projectId: c.projectId,
        // Spec 019: a copy, then independent of the project's.
        goal: c.goal ?? project.goal,
        name: c.name,
        type: c.type,
        createdBy: c.actor.id,
        now: deps.clock.now(),
      })
      if (!created.ok) return created
      await deps.studies.save(created.value)
      return ok({ id: created.value.id })
    },

    /** Spec 021: a study of the team, in no project. */
    createTeamStudy: async (c: {
      actor: Actor
      teamId: string
      name: string
      type: string
      goal?: string | undefined
    }): Promise<Result<{ id: string }, 'TEAM_NOT_FOUND' | 'VALIDATION'>> => {
      const access = await deps.teams.getAccessContext(c.actor.id)
      if (!access || !(await canUseTeam(deps.teams, access, c.teamId))) return err('TEAM_NOT_FOUND')
      const created = Study.create({
        id: newId(),
        teamId: c.teamId,
        projectId: null,
        goal: c.goal ?? '',
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

    /**
     * Spec 009 FR-013: names and titles of the interviews use pseudonyms, or not; spec 012 FR-002:
     * the text Analysis reads.
     */
    setAnonymisation: async (c: {
      actor: Actor
      studyId: string
      anonymised: boolean
      textAnalysed?: TextAnalysed | undefined
      version: number
    }): Promise<Result<{ version: number }, StudyCommandError>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(c.actor.id, study.id))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.version !== c.version) return err('VERSION_CONFLICT')
      study.setAnonymised(c.anonymised, deps.clock.now())
      if (c.textAnalysed) study.setTextAnalysed(c.textAnalysed, deps.clock.now())
      try {
        await deps.studies.save(study)
      } catch (error) {
        if (error instanceof ConcurrencyError) return err('VERSION_CONFLICT')
        throw error
      }
      return ok({ version: c.version + 1 })
    },

    /** Spec 019: changes only the link, so no version to send. */
    attachStudy: async (c: {
      actor: Actor
      projectId: string
      studyId: string
    }): Promise<Result<void, StudyLinkError>> => {
      const project = await projectVisible(c.actor.id, c.projectId)
      if (!project) return err('PROJECT_NOT_FOUND')
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(c.actor.id, study.id))) return err('FOLDER_ACCESS_REQUIRED')
      return changeLinks(study.id, (s) =>
        s.attach({ id: project.id, teamId: project.teamId }, deps.clock.now()),
      )
    },

    /** Spec 019: nothing of the study is deleted, and it may be left without a project. */
    detachStudy: async (c: {
      actor: Actor
      projectId: string
      studyId: string
    }): Promise<Result<void, StudyLinkError>> => {
      if (!(await projectVisible(c.actor.id, c.projectId))) return err('PROJECT_NOT_FOUND')
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      // A run reads the project's studies: it must not lose one on the way (spec 019 R5).
      if (await deps.runs.isRunning(c.projectId)) return err('SYNTHESIS_RUNNING')
      return changeLinks(study.id, (s) => s.detach(c.projectId, deps.clock.now()))
    },

    updateStudyGoal: async (c: {
      actor: Actor
      studyId: string
      goal: string
      version: number
    }): Promise<Result<{ version: number }, StudyCommandError>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (!(await deps.gate.canAct(c.actor.id, study.id))) return err('FOLDER_ACCESS_REQUIRED')
      if (study.version !== c.version) return err('VERSION_CONFLICT')
      const changed = study.changeGoal(c.goal, deps.clock.now())
      if (!changed.ok) return changed
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
    }): Promise<Result<void, StudyCommandError | 'SYNTHESIS_RUNNING'>> => {
      const study = await loadVisible(c.actor.id, c.studyId)
      if (!study) return err('STUDY_NOT_FOUND')
      if (c.actor.role !== 'admin' && !(await deps.gate.canAct(c.actor.id, study.id)))
        return err('FOLDER_ACCESS_REQUIRED')
      // Spec 019: any project it feeds may be reading it.
      for (const projectId of study.projectIds)
        if (await deps.runs.isRunning(projectId)) return err('SYNTHESIS_RUNNING')
      await deps.studies.delete(study.id)
      return ok(undefined)
    },
  }
}

export type StudyCommands = ReturnType<typeof makeStudyCommands>
