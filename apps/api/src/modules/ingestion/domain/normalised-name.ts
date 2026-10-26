import { normaliseWord } from './file-words.ts'
import type { SessionLanguage } from './language.ts'

/** Longest part before the kind of file (spec 009 FR-007). */
export const BASE_MAX = 120
const SEPARATOR = ' – '

const NOT_IN_NAMES = /[/\\:*?"<>|]/g

const clean = (name: string) => name.replace(NOT_IN_NAMES, '-').replace(/\s+/g, ' ').trim()

const join = (date: string, interviewees: string[], interviewers: string[]) =>
  [date, interviewees.join(' & '), interviewers.join(' & ')]
    .filter((part) => part.length > 0)
    .join(SEPARATOR)

/**
 * `YYYY-MM-DD – Interviewees – Interviewers` (research R8); null without a date or anyone
 * interviewed. Long names lose their last words first, so the result fits in BASE_MAX.
 */
export const normalisedBase = (input: {
  readonly date: string | null
  readonly interviewees: readonly string[]
  readonly interviewers: readonly string[]
}): string | null => {
  const interviewees = input.interviewees.map(clean).filter((n) => n.length > 0)
  const interviewers = input.interviewers.map(clean).filter((n) => n.length > 0)
  if (!input.date || interviewees.length === 0) return null
  const people = [interviewees, interviewers]
  let name = join(input.date, interviewees, interviewers)
  while (name.length > BASE_MAX) {
    // The longest name of several words loses its last word.
    let longest: { list: string[]; i: number } | null = null
    for (const list of people)
      list.forEach((n, i) => {
        if (n.includes(' ') && (!longest || n.length > (longest.list[longest.i] ?? '').length))
          longest = { list, i }
      })
    if (!longest) return `${name.slice(0, BASE_MAX - 1).trimEnd()}…`
    const { list, i } = longest as { list: string[]; i: number }
    list[i] = (list[i] ?? '').replace(/\s+\S+$/, '')
    name = join(input.date, interviewees, interviewers)
  }
  return name
}

export type FileToName = {
  readonly fileId: string
  readonly name: string
  readonly kind: 'transcript' | 'media' | 'attachment'
  readonly mimeType: string
  /** An attachment's own label, kept from its original name. */
  readonly label?: string | null | undefined
}

const KINDS = {
  en: { transcript: 'Transcript', video: 'Video', audio: 'Audio', attachment: 'Attachment' },
  fr: { transcript: 'Transcription', video: 'Vidéo', audio: 'Audio', attachment: 'Pièce jointe' },
} as const

const extensionOf = (name: string) => /\.[^./\s]{1,5}$/.exec(name)?.[0] ?? ''

const DATES =
  /\d{4}[-/._]\d{2}[-/._]\d{2}(?:[\sT_]+\d{1,2}[:_hH.]\d{2})?|\d{1,2}[/.]\d{1,2}[/.]\d{4}/g

/** An attachment keeps what its own name says, without the date and the people. */
/** What an attachment is, from its own name without the date and the people ("Consent form"). */
export const attachmentLabel = (name: string, people: readonly string[], fallback = ''): string => {
  const known = new Set(people.flatMap((p) => normaliseWord(p).split(/[^\p{L}\p{N}]+/u)))
  const rest = name
    .slice(0, name.length - extensionOf(name).length)
    .replace(DATES, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !known.has(normaliseWord(w).replace(/[^\p{L}\p{N}]+/gu, '')))
    .join(' ')
    .replace(/^[\s\-–_]+|[\s\-–_]+$/g, '')
  return clean(rest) || fallback
}

/**
 * The new name of each file of an interview: the base, then the kind in the interview's language
 * (English when unknown), numbered when two files share it, the extension kept.
 */
export const renameTargets = (
  base: string,
  files: readonly FileToName[],
  language: SessionLanguage | null,
  people: readonly string[],
): { fileId: string; current: string; next: string }[] => {
  const words = KINDS[language === 'fr' ? 'fr' : 'en']
  const kinds = files.map((f) =>
    f.kind === 'transcript'
      ? words.transcript
      : f.kind === 'attachment'
        ? f.label || attachmentLabel(f.name, people, words.attachment)
        : f.mimeType.startsWith('audio/')
          ? words.audio
          : words.video,
  )
  const counts = new Map<string, number>()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  const seen = new Map<string, number>()
  return files.map((f, i) => {
    const kind = kinds[i] ?? words.attachment
    const nth = (seen.get(kind) ?? 0) + 1
    seen.set(kind, nth)
    const label = (counts.get(kind) ?? 0) > 1 ? `${kind} ${nth}` : kind
    return {
      fileId: f.fileId,
      current: f.name,
      next: `${base}${SEPARATOR}${label}${extensionOf(f.name)}`,
    }
  })
}
