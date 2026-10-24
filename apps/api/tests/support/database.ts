import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import { createDb, type Db } from '../../src/platform/db.ts'

/** A fresh database cloned from the migrated template, private to the calling test file. */
export const createTestDatabase = async (): Promise<{
  db: Db
  url: string
  close: () => Promise<void>
}> => {
  const templateUrl = new URL(inject('templateDatabaseUrl'))
  const template = templateUrl.pathname.slice(1)
  const name = `t_${randomUUID().replaceAll('-', '')}`
  const adminUrl = new URL(templateUrl)
  adminUrl.pathname = '/postgres'
  const admin = new pg.Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  // Cloning fails while another file clones the same template: retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`)
      break
    } catch (error) {
      if (attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200))
    }
  }
  await admin.end()
  const url = new URL(templateUrl)
  url.pathname = `/${name}`
  const { db, pool } = createDb(url.toString())
  return { db, url: url.toString(), close: () => pool.end() }
}
