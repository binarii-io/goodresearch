import { loadConfig } from '@goodresearch/config'
import { runMigrations } from './platform/migrations.ts'
import { createStorage } from './platform/storage.ts'

const config = loadConfig(process.env)
await runMigrations(config.databaseUrl)
if (config.storage.provider === 's3' && config.storage.createBucket)
  await createStorage(config.storage).ensureBucket()
console.log('migrations applied')
