import { loadConfig } from '@goodresearch/config'
import { sql } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'
import { composeApp } from './compose.ts'
import { createDb } from './platform/db.ts'
import { createJobQueue } from './platform/jobs.ts'
import { createStorage } from './platform/storage.ts'

const config = loadConfig(process.env)
const { db, pool } = createDb(config.databaseUrl, config.databasePoolMax)
const storage = createStorage(config.s3)
// The server only enqueues jobs; the worker runs them.
const boss = new PgBoss({
  connectionString: config.databaseUrl,
  max: config.jobsPoolMax,
  supervise: false,
  schedule: false,
})
boss.on('error', (error) => console.error(error))
await boss.start()

const { app } = await composeApp(config, {
  db,
  jobs: createJobQueue(boss),
  isReady: async () => {
    const database = await db.execute(sql`SELECT 1`).then(
      () => true,
      () => false,
    )
    return database && (await storage.isReady())
  },
})

const shutdown = async () => {
  await app.close()
  await boss.stop({ graceful: true })
  await pool.end()
  process.exit(0)
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())

await app.listen({ host: '0.0.0.0', port: config.port })
