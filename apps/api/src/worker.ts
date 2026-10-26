import { loadConfig } from '@goodresearch/config'
import { PgBoss } from 'pg-boss'
import { composeModules } from './compose.ts'
import { createDb } from './platform/db.ts'
import { createJobQueue, registerHandlers } from './platform/jobs.ts'

// Background jobs entrypoint: runs the jobs of every module (spec 002: Drive inventories).
const config = loadConfig(process.env)
const { db, pool } = createDb(config.databaseUrl)
const boss = new PgBoss({ connectionString: config.databaseUrl })
boss.on('error', (error) => console.error(error))
await boss.start()

const modules = composeModules(config, {
  db,
  isReady: async () => true,
  jobs: createJobQueue(boss),
})
await registerHandlers(boss, [...modules.ingestion.jobs, ...modules.transcripts.jobs])
console.log('worker started')

const stop = async () => {
  await boss.stop({ graceful: true })
  await pool.end()
  process.exit(0)
}
process.once('SIGTERM', () => void stop())
process.once('SIGINT', () => void stop())
