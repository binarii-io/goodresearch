import { loadConfig } from '@goodresearch/config'
import { sql } from 'drizzle-orm'
import { composeApp } from './compose.ts'
import { createDb } from './platform/db.ts'
import { createStorage } from './platform/storage.ts'

const config = loadConfig(process.env)
const { db, pool } = createDb(config.databaseUrl)
const storage = createStorage(config.s3)

const { app } = await composeApp(config, {
  db,
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
  await pool.end()
  process.exit(0)
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())

await app.listen({ host: '0.0.0.0', port: config.port })
