// drizzle-kit always writes foreign keys to "public"."table" and has no option against it: the
// migrations must follow the connection's search_path (ADR-0005). Runs after `drizzle-kit generate`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const folder = new URL('../drizzle/', import.meta.url)
for (const name of readdirSync(folder)) {
  if (!name.endsWith('.sql')) continue
  const file = new URL(name, folder)
  const sql = readFileSync(file, 'utf8')
  if (sql.includes('"public".')) writeFileSync(file, sql.replaceAll('"public".', ''))
}
