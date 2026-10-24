import { describe, expect, it } from 'vitest'
import { classifyFile } from '../domain/classify.ts'

describe('classifyFile (FR-013)', () => {
  it.each([
    ['Notes by Gemini', 'application/vnd.google-apps.document'],
    ['interview.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['old.doc', 'application/msword'],
    ['notes.txt', 'text/plain'],
    ['captions.vtt', 'text/vtt'],
    ['captions.srt', 'application/x-subrip'],
    ['captions.srt', 'application/octet-stream'],
  ])('%s (%s) is a transcript', (name, mimeType) => {
    expect(classifyFile({ name, mimeType })).toBe('transcript')
  })

  it.each([
    ['recording.mp4', 'video/mp4'],
    ['call.webm', 'video/webm'],
    ['audio.m4a', 'audio/mp4'],
    ['voice.mp3', 'audio/mpeg'],
  ])('%s (%s) is media', (name, mimeType) => {
    expect(classifyFile({ name, mimeType })).toBe('media')
  })

  it.each([
    ['slides', 'application/vnd.google-apps.presentation'],
    ['sheet', 'application/vnd.google-apps.spreadsheet'],
    ['report.pdf', 'application/pdf'],
    ['README', 'application/octet-stream'],
  ])('%s (%s) is other', (name, mimeType) => {
    expect(classifyFile({ name, mimeType })).toBe('other')
  })
})
