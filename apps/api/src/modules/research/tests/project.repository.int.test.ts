import { afterAll } from 'vitest'
import { createTestDatabase } from '../../../../tests/support/database.ts'
import { insertTeams } from '../../../../tests/support/fixtures.ts'
import { drizzleProjectRepository } from '../infrastructure/project.drizzle-repository.ts'
import { projectRepositoryContract } from './project.repository.contract.ts'

const databases: Awaited<ReturnType<typeof createTestDatabase>>[] = []
afterAll(async () => {
  await Promise.all(databases.map((d) => d.close()))
})

projectRepositoryContract('drizzle', async () => {
  const database = await createTestDatabase()
  databases.push(database)
  const [a, b] = await insertTeams(database.db, ['Team A', 'Team B'])
  if (!a || !b) throw new Error('fixture')
  return { repository: drizzleProjectRepository(database.db), teamIds: [a, b] }
})
