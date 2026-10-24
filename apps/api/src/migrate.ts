import { loadConfig } from '@goodresearch/config'
import { runMigrations } from './platform/migrations.ts'
import { createStorage } from './platform/storage.ts'

const config = loadConfig(process.env)
await runMigrations(config.databaseUrl)
if (config.s3.createBucket) await createStorage(config.s3).ensureBucket()
console.log('migrations applied')
