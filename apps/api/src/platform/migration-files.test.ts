import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url))

describe('migration files', () => {
  it('name no schema: tables follow the search_path of the connection', () => {
    const named = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => readFileSync(`${folder}${name}`, 'utf8').includes('"public".'))
    expect(named).toEqual([])
  })
})
