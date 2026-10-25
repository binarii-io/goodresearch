/** Lower case, accents removed: "Élodie" and "elodie" are the same word. */
export const normaliseWord = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Words of every interview file name, in English and French, that say nothing about who or when. */
const COMMON = new Set([
  'interview',
  'interviews',
  'entretien',
  'entretiens',
  'transcript',
  'transcription',
  'transcripts',
  'audio',
  'video',
  'recording',
  'enregistrement',
  'meeting',
  'reunion',
  'call',
  'appel',
  'session',
  'final',
  'copy',
  'copie',
  'notes',
  'the',
  'and',
  'with',
  'avec',
  'les',
  'des',
  'pour',
])

const split = (text: string): string[] =>
  normaliseWord(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w))

const withoutExtension = (name: string): string => name.replace(/\.[^./]{1,5}$/, '')

/**
 * Words of a file name that can tell two files apart (research R3): no extension, no number, no word
 * shorter than 3 letters, none of the common words.
 */
export const fileWords = (name: string): ReadonlySet<string> =>
  new Set(split(withoutExtension(name)).filter((w) => !COMMON.has(w)))

/** Words of a person's name, for the name rule (research R4). */
export const nameWords = (name: string): readonly string[] => [...new Set(split(name))]

/** Words found in at most `max` of the given files: the ones that can pair a recording and a transcript. */
export const rareWords = (names: readonly string[], max = 3): ReadonlySet<string> => {
  const counts = new Map<string, number>()
  for (const name of names)
    for (const word of fileWords(name)) counts.set(word, (counts.get(word) ?? 0) + 1)
  return new Set([...counts].filter(([, n]) => n <= max).map(([w]) => w))
}

/**
 * Endings that only say which file of a meeting it is ("- Recording", "- Transcript", "- Notes by
 * <assistant>"), as video meeting tools name the files they save.
 */
const KIND_ENDING =
  /\s*[-–]\s*(recording|enregistrement|notes?(\s+(par|by|de)\s+\S+)?|transcript(ion)?(\s*\d+)?|audio|video|vid[eé]o)\s*$/i

const MEETING_TIME = /(\d{4})[/_.-](\d{2})[/_.-](\d{2})[\sT_]+(\d{1,2})[:_hH.](\d{2})/

const simplify = (text: string) =>
  normaliseWord(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * What names a meeting in its file names (research R3): the title before the time written in the
 * name ("Title - 2026/10/21 15:02 CEST - Recording"), and that time in minutes; without a time,
 * the name without its kind ending ("- Recording", "- Transcript").
 */
export const meetingOf = (name: string): { readonly title: string; readonly at: number | null } => {
  const base = name.replace(/\.[^./]{1,5}$/, '')
  const time = MEETING_TIME.exec(base)
  if (time) {
    const [, y, mo, d, h, mi] = time.map(Number) as number[]
    return {
      title: simplify(base.slice(0, time.index)),
      at: Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0) / 60_000,
    }
  }
  let title = base
  while (KIND_ENDING.test(title)) title = title.replace(KIND_ENDING, '')
  return { title: simplify(title), at: null }
}
