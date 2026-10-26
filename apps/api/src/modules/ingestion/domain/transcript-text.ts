import { speakerTurns } from './header-rules.ts'

const CUE_TIME = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,]\d{1,3}\s*-->/
const CUE_NUMBER = /^\s*\d+\s*$/

const clock = (h: string | undefined, m: string, s: string) =>
  `[${(h ?? '0').padStart(2, '0')}:${m.padStart(2, '0')}:${s}] `

/**
 * Subtitles (WebVTT, SubRip) as plain text: no header or cue numbers; each cue's first line starts
 * with its time `[hh:mm:ss]` (spec 010: turns keep their time); a voice tag `<v Name>` becomes the
 * label `Name:` the speaker rules read (spec 009 research R2).
 */
export const subtitlesToText = (raw: string): string => {
  let start = ''
  const lines: string[] = []
  for (const line of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const cue = CUE_TIME.exec(line)
    if (cue) {
      start = clock(cue[1], cue[2] ?? '0', cue[3] ?? '00')
      continue
    }
    if (/^WEBVTT\b/.test(line) || CUE_NUMBER.test(line)) continue
    const text = line
      .replace(/^\s*<v(?:\.[^\s>]+)?\s+([^>]+)>(.*?)(?:<\/v>)?\s*$/, '$1: $2')
      .replace(/<[^>]+>/g, '')
      .trimEnd()
    if (text.length > 0 && start) {
      lines.push(start + text.trimStart())
      start = ''
    } else lines.push(text)
  }
  return lines
    .filter((line, i, all) => line.length > 0 || (all[i - 1] ?? '').length > 0)
    .join('\n')
    .trim()
}

/** Cuts text on a whole character (never half a surrogate pair). */
export const cutText = (text: string, maxChars: number): string =>
  Array.from(text).slice(0, maxChars).join('')

const TIMESTAMP = /^\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*$|^\s*\[?\d{1,2}:\d{2}:\d{2}\]?\s/m

/** Below this, a text is too short to tell: it is kept as a transcript. */
const TOO_SHORT = 1_000

/**
 * Spec 009: a transcript has speaker turns — someone speaking at least twice among several turns —
 * or timestamps; a summary (meeting notes, decisions, next steps) has neither. Headings such as
 * "Next steps:" look like labels but do not come back.
 */
export const looksLikeTranscript = (text: string): boolean => {
  if (text.trim().length < TOO_SHORT) return true
  const turns = speakerTurns(text)
  const repeated = turns.some((label, i) => turns.indexOf(label) !== i)
  if (turns.length >= 3 && repeated) return true
  const stamps = text.split(/\r?\n/).filter((line) => TIMESTAMP.test(line)).length
  return stamps >= 3
}
