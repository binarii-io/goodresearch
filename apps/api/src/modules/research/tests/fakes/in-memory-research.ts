import { type Clock, ConcurrencyError } from '@goodresearch/shared'
import type { ResearchCommandDeps, TeamDirectory } from '../../application/ports.ts'
import type { ProjectRepository } from '../../domain/project.repository.ts'
import { Project } from '../../domain/project.ts'

/** In-memory research ports (fakes, not mocks). */
export class InMemoryResearch {
  readonly projects = new Map<string, Project>()
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

  deps(clock: Clock): ResearchCommandDeps {
    return {
      uow: (work) => work({ projects: this.projectRepository }),
      clock,
      teams: this.#directory,
    }
  }
}
