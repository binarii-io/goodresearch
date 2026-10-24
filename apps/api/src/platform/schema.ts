// Every table, for the Drizzle client and drizzle-kit. Modules own their tables (docs/standards.md §6).
import * as ingestion from '../modules/ingestion/infrastructure/schema.ts'
import * as research from '../modules/research/infrastructure/schema.ts'
import * as workspace from '../modules/workspace/infrastructure/schema.ts'
import * as auth from './auth/auth-schema.ts'

export const schema = { ...auth, ...workspace, ...research, ...ingestion }
