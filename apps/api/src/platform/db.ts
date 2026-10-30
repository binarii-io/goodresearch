import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { schema } from './schema.ts'

export type Schema = typeof schema
export type Db = NodePgDatabase<Schema>
/** A transaction handle; repositories are built on it inside a unit of work. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** Anything repositories can run queries on: the database or a transaction. */
export type Executor = Db | Tx

export const createDb = (databaseUrl: string, max = 10): { db: Db; pool: pg.Pool } => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max })
  return { db: drizzle(pool, { schema }), pool }
}
