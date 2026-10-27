import type { TermLanguage } from './candidates.ts'
import type { Segment } from './segments.ts'

/** The neutral document model of spec 007, as the ingestion port takes it. */
export type DocBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }

export type DocModel = { readonly blocks: readonly DocBlock[] }

const SUFFIX = { en: 'clean', fr: 'nettoyée' } as const

/** The name of the published document: the interview's title, marked clean. */
export const cleanDocName = (title: string, language: TermLanguage) =>
  `${title} – ${language === 'fr' ? SUFFIX.fr : SUFFIX.en}`

const time = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')

/** Spec 011 FR-018: a title line, then one paragraph per turn, `[hh:mm:ss] Speaker: text`. */
export const renderCleanDoc = (
  title: string,
  language: TermLanguage,
  segments: readonly Segment[],
): DocModel => ({
  blocks: [
    { kind: 'heading', level: 1, text: cleanDocName(title, language) },
    ...segments.map(
      (s): DocBlock => ({
        kind: 'paragraph',
        text: `${s.start !== null ? `[${time(s.start)}] ` : ''}${s.speaker ? `${s.speaker}: ` : ''}${s.text}`,
      }),
    ),
  ],
})
