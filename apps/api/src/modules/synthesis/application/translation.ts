import { holdsName } from '@goodresearch/shared'
import type { Bilingual, PendingTranslation, Translation } from '../domain/insights.ts'
import type { InsightTranslateJob, SaveOutcome, SynthesisDeps, TranslatedTexts } from './ports.ts'

/** Something with texts in two languages, translated in the background after a person's edit. */
type Translatable = {
  readonly version: number
  readonly translation: Translation
  readonly pendingTranslation?: PendingTranslation | null | undefined
}

type Fields<T> = { readonly [field: string]: number } & Partial<Record<keyof T, number>>

const textOf = <T>(item: T, field: string): Bilingual =>
  (item as Record<string, Bilingual>)[field] ?? { en: '', fr: '' }

/**
 * A person's texts, one language or both (spec 012 research R9, spec 013 review): a field given in
 * one language keeps the other's words until its translation comes; a text cleared is cleared in
 * both; `pending` is what "Translate again" sends after a failure.
 */
export const givenTexts = <F extends string>(
  fields: readonly F[],
  given: Partial<Record<F, { en?: string | undefined; fr?: string | undefined } | undefined>>,
  current: Partial<Record<F, Bilingual>>,
) => {
  const texts: Partial<Record<F, Bilingual>> = {}
  const toTranslate: TranslatedTexts = {}
  let from: 'en' | 'fr' | null = null
  for (const field of fields) {
    const g = given[field]
    if (!g || (g.en === undefined && g.fr === undefined)) continue
    const before = current[field] ?? { en: '', fr: '' }
    const en = g.en?.trim()
    const fr = g.fr?.trim()
    if ((en === '' && fr === undefined) || (fr === '' && en === undefined)) {
      texts[field] = { en: '', fr: '' }
      continue
    }
    texts[field] = { en: en ?? before.en, fr: fr ?? before.fr }
    if (en !== undefined && fr === undefined) {
      from = 'en'
      toTranslate[field] = en
    } else if (fr !== undefined && en === undefined) {
      from = from ?? 'fr'
      toTranslate[field] = fr
    }
  }
  const pending: PendingTranslation | null = from
    ? ({ from, fields: fields.filter((f) => toTranslate[f] !== undefined) } as PendingTranslation)
    : null
  return { texts, toTranslate, from, pending }
}

/**
 * The translation state after a person's edit (review of PR #14): a field written in one language
 * starts a translation; fields written in both languages end the one in flight for them.
 */
export const translationAfter = <T extends Translatable>(
  item: T,
  written: readonly string[],
  from: 'en' | 'fr' | null,
  waiting: PendingTranslation | null,
): Pick<T, 'translation' | 'pendingTranslation'> => {
  if (from)
    return { translation: 'translating', pendingTranslation: waiting } as Pick<
      T,
      'translation' | 'pendingTranslation'
    >
  // Without knowing what is pending, the state stays (review of PR #14).
  const pending = item.pendingTranslation?.fields ?? null
  const covered =
    item.translation !== 'done' && pending !== null && pending.every((f) => written.includes(f))
  return (
    covered && written.length > 0
      ? { translation: 'done', pendingTranslation: null }
      : { translation: item.translation, pendingTranslation: item.pendingTranslation ?? null }
  ) as Pick<T, 'translation' | 'pendingTranslation'>
}

/**
 * The background translation of spec 013, for any translatable thing: applied while the person's
 * words are still there, again on the thing as it is when it changed meanwhile; a translation too
 * long, or a `checked` field holding a known name, is not kept (`not-translated`, pending again).
 */
export const runTranslation = async <T extends Translatable>(
  deps: SynthesisDeps,
  job: InsightTranslateJob,
  how: {
    readonly load: () => Promise<T | null>
    readonly save: (item: T, expected: number) => Promise<SaveOutcome>
    readonly ref: string
    readonly max: Fields<T>
    readonly checked: readonly string[]
    readonly names: () => Promise<readonly string[]>
  },
): Promise<void> => {
  const still = (item: T) =>
    Object.entries(job.texts).every(([field, text]) => textOf(item, field)[job.from] === text)
  const saveAgain = async (apply: (item: T) => T) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const item = await how.load()
      if (!item || !still(item)) return
      if ((await how.save(apply(item), item.version)) === 'ok') return
    }
    deps.log.warn({ id: job.insightId }, 'translation not saved')
  }
  const first = await how.load()
  if (!first || !still(first)) return
  const to = job.from === 'en' ? 'fr' : 'en'
  let translated: TranslatedTexts
  try {
    translated = await deps.ai.translate(job.accountId, how.ref, {
      texts: job.texts,
      from: job.from,
      to,
    })
  } catch {
    return saveAgain((item) => ({
      ...item,
      translation: 'not-translated',
      version: item.version + 1,
    }))
  }
  const names = await how.names()
  const asked = Object.keys(job.texts)
  const usable = (field: string) => {
    const text = translated[field]?.trim()
    if (!text || text.length > (how.max[field] ?? 0)) return null
    return how.checked.includes(field) && holdsName(text, names) ? null : text
  }
  const missing = asked.filter((f) => usable(f) === null)
  return saveAgain((item) => {
    const next = { ...item } as Record<string, unknown>
    for (const field of asked) {
      const text = usable(field)
      if (text) next[field] = { ...textOf(item, field), [to]: text }
    }
    return {
      ...(next as T),
      translation: missing.length > 0 ? 'not-translated' : 'done',
      pendingTranslation:
        missing.length > 0 ? ({ from: job.from, fields: missing } as PendingTranslation) : null,
      version: item.version + 1,
    }
  })
}
