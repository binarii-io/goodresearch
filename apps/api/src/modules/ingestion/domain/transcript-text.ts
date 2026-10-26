import { speakerTurns } from './header-rules.ts'

const CUE_TIME = /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->/
const CUE_NUMBER = /^\s*\d+\s*$/

/**
 * Subtitles (WebVTT, SubRip) as plain text: no header, cue numbers or timings; a voice tag
 * `<v Name>` becomes the label `Name:` the speaker rules read (spec 009 research R2).
 */
export const subtitlesToText = (raw: string): string =>
  raw
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => !/^WEBVTT\b/.test(line) && !CUE_TIME.test(line) && !CUE_NUMBER.test(line))
    .map((line) =>
      line
        .replace(/^\s*<v(?:\.[^\s>]+)?\s+([^>]+)>(.*?)(?:<\/v>)?\s*$/, '$1: $2')
        .replace(/<[^>]+>/g, '')
        .trimEnd(),
    )
    .filter((line, i, all) => line.length > 0 || (all[i - 1] ?? '').length > 0)
    .join('\n')
    .trim()

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
