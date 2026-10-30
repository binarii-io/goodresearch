import { fileURLToPath } from 'node:url'
import { newId } from '@goodresearch/shared'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type pg from 'pg'
import { PgBoss } from 'pg-boss'
import { workspaceWorkspaces } from '../modules/workspace/infrastructure/schema.ts'
import { createDb } from './db.ts'
import { createQueues } from './jobs.ts'

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url))
/** Arbitrary constant identifying the migration lock. */
const LOCK_KEY = 4_242_001

const schemaExists = async (client: pg.PoolClient, name: string): Promise<boolean> =>
  (await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [name])).rowCount === 1

/**
 * Drizzle's migrator, same table and rule (a migration newer than the last applied), without its
 * unconditional `CREATE SCHEMA IF NOT EXISTS`: PostgreSQL refuses it to a role without CREATE on
 * the database, even when the schema exists and the role owns it (ADR-0005).
 */
const applyMigrations = async (client: pg.PoolClient): Promise<void> => {
  if (!(await schemaExists(client, 'drizzle'))) await client.query('CREATE SCHEMA "drizzle"')
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  const { rows } = await client.query<{ created_at: string }>(
    'SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
  )
  const last = rows[0] ? Number(rows[0].created_at) : null
  await client.query('BEGIN')
  try {
    for (const migration of readMigrationFiles({ migrationsFolder: MIGRATIONS })) {
      if (last !== null && last >= migration.folderMillis) continue
      for (const statement of migration.sql) await client.query(statement)
      await client.query(
        'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [migration.hash, migration.folderMillis],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/** Applies migrations, installs the job queue schema and seeds the workspace. Safe to run concurrently. */
export const runMigrations = async (databaseUrl: string): Promise<void> => {
  const { db, pool } = createDb(databaseUrl)
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY])
    await applyMigrations(client)
    const boss = new PgBoss({
      connectionString: databaseUrl,
      createSchema: !(await schemaExists(client, 'pgboss')),
    })
    await boss.start()
    await createQueues(boss)
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
