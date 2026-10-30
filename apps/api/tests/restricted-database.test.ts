import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDb } from '../src/platform/db.ts'
import { runMigrations } from '../src/platform/migrations.ts'

/** A role that owns three schemas and nothing else: no CREATE on the database nor on public. */
describe('migrating with the fewest rights', () => {
  const suffix = randomUUID().replaceAll('-', '')
  const database = `restricted_${suffix}`
  const role = `app_${suffix}`
  const adminUrl = new URL(inject('templateDatabaseUrl'))
  adminUrl.pathname = '/postgres'
  const url = new URL(adminUrl)
  url.pathname = `/${database}`
  url.username = role
  url.password = 'secret'

  const query = async (connectionString: string, text: string) => {
    const client = new pg.Client({ connectionString })
    await client.connect()
    try {
      return await client.query(text)
    } finally {
      await client.end()
    }
  }

  beforeAll(async () => {
    await query(adminUrl.toString(), `CREATE ROLE "${role}" LOGIN PASSWORD 'secret'`)
    await query(adminUrl.toString(), `CREATE DATABASE "${database}"`)
    const owner = new URL(adminUrl)
    owner.pathname = `/${database}`
    await query(
      owner.toString(),
      `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
       CREATE SCHEMA goodresearch AUTHORIZATION "${role}";
       CREATE SCHEMA pgboss AUTHORIZATION "${role}";
       CREATE SCHEMA drizzle AUTHORIZATION "${role}";
       ALTER ROLE "${role}" IN DATABASE "${database}" SET search_path = goodresearch`,
    )
  })

  afterAll(async () => {
    await query(adminUrl.toString(), `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await query(adminUrl.toString(), `DROP ROLE IF EXISTS "${role}"`)
  })

  it('creates everything in its own schema, and the job queue works', async () => {
    await runMigrations(url.toString())
    const tables = await query(
      url.toString(),
      `SELECT table_schema, count(*)::int AS n FROM information_schema.tables
       WHERE table_schema IN ('public', 'goodresearch') GROUP BY 1`,
    )
    expect(tables.rows.map((r) => r.table_schema)).toEqual(['goodresearch'])
    const boss = new PgBoss({ connectionString: url.toString() })
    await boss.start()
    await boss.createQueue('restricted-test')
    expect(await boss.send('restricted-test', {})).not.toBeNull()
    await boss.stop({ graceful: false })
  })

  it('records the same migrations as the Drizzle migrator it replaces', async () => {
    const other = `drizzle_${suffix}`
    await query(adminUrl.toString(), `CREATE DATABASE "${other}"`)
    const otherUrl = new URL(adminUrl)
    otherUrl.pathname = `/${other}`
    const { db, pool } = createDb(otherUrl.toString())
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    })
    await pool.end()
    const rows = 'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'
    const theirs = (await query(otherUrl.toString(), rows)).rows
    await query(adminUrl.toString(), `DROP DATABASE "${other}" WITH (FORCE)`)
    expect((await query(url.toString(), rows)).rows).toEqual(theirs)
  })

  it('applies nothing again, whatever the recorded hashes of older files', async () => {
    const count = 'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations'
    const before = (await query(url.toString(), count)).rows[0].n
    // A database migrated before the "public". qualifiers left the files.
    await query(url.toString(), `UPDATE drizzle.__drizzle_migrations SET hash = 'older'`)
    await runMigrations(url.toString())
    expect((await query(url.toString(), count)).rows[0].n).toBe(before)
  })
})
