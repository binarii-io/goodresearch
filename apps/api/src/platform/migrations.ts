import { fileURLToPath } from 'node:url'
import { newId } from '@goodresearch/shared'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { PgBoss } from 'pg-boss'
import { workspaceWorkspaces } from '../modules/workspace/infrastructure/schema.ts'
import { createDb } from './db.ts'

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url))
/** Arbitrary constant identifying the migration lock. */
const LOCK_KEY = 4_242_001

/** Applies migrations, installs the job queue schema and seeds the workspace. Safe to run concurrently. */
export const runMigrations = async (databaseUrl: string): Promise<void> => {
  const { db, pool } = createDb(databaseUrl)
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await migrate(db, { migrationsFolder: MIGRATIONS })
    const boss = new PgBoss({ connectionString: databaseUrl })
    await boss.start()
    await boss.stop({ graceful: false })
    await db.execute(sql`
      INSERT INTO ${workspaceWorkspaces} (id)
      SELECT ${newId()} WHERE NOT EXISTS (SELECT 1 FROM ${workspaceWorkspaces})
    `)
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined)
    client.release()
    await pool.end()
  }
}
