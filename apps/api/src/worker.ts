import { loadConfig } from '@goodresearch/config'
import { PgBoss } from 'pg-boss'

// Background jobs entrypoint. No job is registered yet (spec 001); later modules add theirs here.
const config = loadConfig(process.env)
const boss = new PgBoss({ connectionString: config.databaseUrl })
boss.on('error', (error) => console.error(error))
await boss.start()
console.log('worker started')

const stop = async () => {
  await boss.stop({ graceful: true })
  process.exit(0)
}
process.once('SIGTERM', () => void stop())
process.once('SIGINT', () => void stop())
