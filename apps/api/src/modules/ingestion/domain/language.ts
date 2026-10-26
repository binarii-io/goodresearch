import { normaliseWord } from './file-words.ts'

export type SessionLanguage = 'en' | 'fr' | 'other'

// Short, frequent words; accents removed (normaliseWord).
const EN = new Set(
  'the and you that what this with have for are was not but they about think there would could so do it is we'.split(
    ' ',
  ),
)
const FR = new Set(
  'le la les des est que qui pas vous nous une pour dans avec sur alors mais cest tres aussi ca on je tu il elle de du en et'.split(
    ' ',
  ),
)

/** Research R3: the language with at least twice the other's common words, else `other`. */
export const languageOf = (text: string): SessionLanguage => {
  let en = 0
  let fr = 0
  for (const m of text.matchAll(/[\p{L}']+/gu)) {
    for (const part of normaliseWord(m[0]).split("'")) {
      if (EN.has(part)) en++
      if (FR.has(part)) fr++
    }
  }
  if (en >= 3 && en >= 2 * fr) return 'en'
  if (fr >= 3 && fr >= 2 * en) return 'fr'
  return 'other'
}
