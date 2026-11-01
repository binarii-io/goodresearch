import { type Clock, ConcurrencyError } from '@goodresearch/shared'
import type {
  ProjectRunGate,
  ResearchCommandDeps,
  StudyActionGate,
  TeamDirectory,
} from '../../application/ports.ts'
import { InterviewGuide } from '../../domain/interview-guide.ts'
import { PlannedInterview } from '../../domain/planned-interview.ts'
import type {
  InterviewGuideRepository,
  PlannedInterviewRepository,
} from '../../domain/preparation.repository.ts'
import type { ProjectRepository } from '../../domain/project.repository.ts'
import { Project } from '../../domain/project.ts'
import type { StudyRepository } from '../../domain/study.repository.ts'
import { Study } from '../../domain/study.ts'

/** In-memory research ports (fakes, not mocks). */
export class InMemoryResearch {
  readonly projects = new Map<string, Project>()
  readonly studies = new Map<string, Study>()
  /** `${accountId}:${studyId}` pairs without access to the study's folder. */
  readonly folderAccessDenied = new Set<string>()
  #nextProject = 0
  readonly #directory: TeamDirectory

  constructor(world: { teams: string[]; memberships: Record<string, string[]>; admins: string[] }) {
    this.#directory = {
      getAccessContext: async (accountId) => {
        if (world.admins.includes(accountId)) return { role: 'admin', teamIds: [] }
        const teamIds = world.memberships[accountId]
        return teamIds ? { role: 'member', teamIds } : null
      },
      teamExists: async (teamId) => world.teams.includes(teamId),
    }
  }

  readonly projectRepository: ProjectRepository = {
    findById: async (id) => {
      const project = this.projects.get(id)
      return project ? Project.fromPersistence(project.snapshot()) : null
    },
    delete: async (id) => {
      this.projects.delete(id)
      for (const [studyId, study] of this.studies) {
        const props = study.snapshot()
        this.studies.set(
          studyId,
          Study.fromPersistence({
            ...props,
            projectIds: props.projectIds.filter((p) => p !== id),
          }),
        )
      }
    },
    save: async (project) => {
      const stored = this.projects.get(project.id)
      if (stored && stored.version !== project.version) throw new ConcurrencyError()
      const version = stored ? project.version + 1 : 0
      this.projects.set(project.id, Project.fromPersistence({ ...project.snapshot(), version }))
    },
  }

  readonly studyRepository: StudyRepository = {
    findById: async (id) => {
      const study = this.studies.get(id)
      return study ? Study.fromPersistence(study.snapshot()) : null
    },
    findByProject: async (projectId) =>
      [...this.studies.values()]
        .filter((s) => s.projectIds.includes(projectId))
        .map((s) => Study.fromPersistence(s.snapshot())),
    save: async (study) => {
      const stored = this.studies.get(study.id)
      if (stored && stored.version !== study.version) throw new ConcurrencyError()
      this.studies.set(
        study.id,
        Study.fromPersistence({ ...study.snapshot(), version: stored ? study.version + 1 : 0 }),
      )
    },
    delete: async (id) => {
      this.studies.delete(id)
    },
  }

  readonly guides = new Map<string, InterviewGuide>()
  readonly planned = new Map<string, PlannedInterview>()

  readonly guideRepository: InterviewGuideRepository = {
    findByStudy: async (studyId) => {
      const guide = this.guides.get(studyId)
      return guide ? InterviewGuide.fromPersistence(guide.snapshot()) : null
    },
    insert: async (guide) => {
      if (this.guides.has(guide.studyId)) throw new ConcurrencyError()
      this.guides.set(guide.studyId, InterviewGuide.fromPersistence(guide.snapshot()))
    },
    update: async (guide) => {
      const stored = this.guides.get(guide.studyId)
      if (!stored || stored.version !== guide.version) throw new ConcurrencyError()
      this.guides.set(
        guide.studyId,
        InterviewGuide.fromPersistence({ ...guide.snapshot(), version: guide.version + 1 }),
      )
    },
  }

  readonly plannedRepository: PlannedInterviewRepository = {
    findById: async (id) => {
      const row = this.planned.get(id)
      return row ? PlannedInterview.fromPersistence(row.snapshot()) : null
    },
    insertIfRoom: async (row, limit) => {
      if ([...this.planned.values()].filter((r) => r.studyId === row.studyId).length >= limit)
        return false
      this.planned.set(row.id, PlannedInterview.fromPersistence({ ...row.snapshot(), version: 0 }))
      return true
    },
    update: async (row) => {
      const stored = this.planned.get(row.id)
      if (!stored || stored.version !== row.version) throw new ConcurrencyError()
      this.planned.set(
        row.id,
        PlannedInterview.fromPersistence({ ...row.snapshot(), version: row.version + 1 }),
      )
    },
    delete: async (id) => {
      this.planned.delete(id)
    },
  }

  readonly gate: StudyActionGate = {
    canAct: async (accountId, studyId) => !this.folderAccessDenied.has(`${accountId}:${studyId}`),
  }

  /** Projects with a synthesis run in progress (spec 019). */
  readonly runningProjects = new Set<string>()
  readonly runs: ProjectRunGate = {
    isRunning: async (projectId) => this.runningProjects.has(projectId),
  }

  async addProject(teamId: string): Promise<string> {
    const id = `project-${++this.#nextProject}`
    const created = Project.create({
      id,
      teamId,
      name: id,
      goal: '',
      createdBy: null,
      now: new Date(0),
    })
    if (!created.ok) throw new Error('fixture')
    await this.projectRepository.save(created.value)
    return id
  }

  deps(clock: Clock): ResearchCommandDeps {
    return {
      uow: (work) => work({ projects: this.projectRepository, studies: this.studyRepository }),
      clock,
      teams: this.#directory,
    }
  }
}
