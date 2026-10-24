import { type Clock, ConcurrencyError } from '@goodresearch/shared'
import type {
  ResearchCommandDeps,
  StudyActionGate,
  TeamDirectory,
} from '../../application/ports.ts'
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

  readonly gate: StudyActionGate = {
    canAct: async (accountId, studyId) => !this.folderAccessDenied.has(`${accountId}:${studyId}`),
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
      uow: (work) => work({ projects: this.projectRepository }),
      clock,
      teams: this.#directory,
    }
  }
}
