import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { CommonWords } from '../domain/candidates.ts'

/**
 * Research R2: the common words of English and French, folded, loaded once on first use. Sources
 * and licences: `words/` and the module README.
 */
export const createCommonWords = (): CommonWords => {
  const sets = new Map<string, ReadonlySet<string>>()
  const load = (language: 'en' | 'fr') => {
    const known = sets.get(language)
    if (known) return known
    const text = gunzipSync(readFileSync(new URL(`./words/${language}.txt.gz`, import.meta.url)))
    const set = new Set(text.toString('utf8').split('\n'))
    sets.set(language, set)
    return set
  }
  return (language, folded) => (language === 'other' ? false : load(language).has(folded))
}
