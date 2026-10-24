// Writes the OpenAPI document without any database: routes are registered, handlers never run.
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '@goodresearch/config'
import { composeApp } from './compose.ts'
import type { Db } from './platform/db.ts'

const config = loadConfig({
  APP_URL: 'http://localhost:3000',
  AUTH_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: 'postgres://unused',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'unused',
  S3_BUCKET: 'unused',
  S3_ACCESS_KEY_ID: 'unused',
  S3_SECRET_ACCESS_KEY: 'unused',
  ADMIN_EMAILS: 'admin@example.org',
})

const { app } = await composeApp(
  config,
  { db: {} as Db, isReady: async () => false },
  { logger: false },
)
await app.ready()
const target = fileURLToPath(new URL('../../../packages/api-client/openapi.json', import.meta.url))
writeFileSync(target, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
console.log(`OpenAPI written to ${target}`)
