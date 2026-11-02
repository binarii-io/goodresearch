import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Drizzle only applies a migration newer than the last one applied, by the journal's `when`: one
 * dated before its predecessor is silently skipped on every existing database, while a new one
 * still gets it. Hand-written migrations must date themselves after the previous one.
 */
describe('migrations journal', () => {
  it('has strictly increasing dates', () => {
    const journal = JSON.parse(
      readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
    ) as { entries: { tag: string; when: number }[] }
    const late = journal.entries.filter(
      (entry, i) => i > 0 && entry.when <= (journal.entries[i - 1]?.when ?? 0),
    )
    expect(late.map((entry) => entry.tag)).toEqual([])
  })
})
