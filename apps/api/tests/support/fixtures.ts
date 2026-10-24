import { newId } from '@goodresearch/shared'
import { workspaceTeams } from '../../src/modules/workspace/infrastructure/schema.ts'
import type { Db } from '../../src/platform/db.ts'

/** Inserts teams directly (test arrangement only; the app creates them through commands). */
export const insertTeams = async (db: Db, names: readonly string[]): Promise<string[]> => {
  const now = new Date()
  const rows = names.map((name) => ({
    id: newId(),
    name,
    nameKey: name.trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
  }))
  await db.insert(workspaceTeams).values(rows)
  return rows.map((r) => r.id)
}
