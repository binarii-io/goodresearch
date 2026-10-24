import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'
import { runMigrations } from '../../src/platform/migrations.ts'

declare module 'vitest' {
  interface ProvidedContext {
    /** Migrated template database; each test file clones it (see tests/support/database.ts). */
    templateDatabaseUrl: string
  }
}

let container: StartedPostgreSqlContainer | undefined

/** One PostgreSQL container per test run, migrated once. */
export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:18-alpine').start()
  const url = container.getConnectionUri()
  await runMigrations(url)
  project.provide('templateDatabaseUrl', url)
  return async () => {
    await container?.stop()
  }
}
