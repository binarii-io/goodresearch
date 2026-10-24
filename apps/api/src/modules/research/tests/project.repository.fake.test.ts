import { InMemoryResearch } from './fakes/in-memory-research.ts'
import { projectRepositoryContract } from './project.repository.contract.ts'

projectRepositoryContract('in-memory', async () => ({
  repository: new InMemoryResearch({ teams: ['team-a', 'team-b'], memberships: {}, admins: [] })
    .projectRepository,
  teamIds: ['team-a', 'team-b'],
}))
