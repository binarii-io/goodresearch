export type FileKind = 'transcript' | 'media' | 'other'

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

const TRANSCRIPT_MIME = new Set([
  GOOGLE_DOC_MIME,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/vtt',
  'application/x-subrip',
])
const TRANSCRIPT_EXTENSIONS = ['.doc', '.docx', '.txt', '.vtt', '.srt']

/**
 * Spec 008: a document with tabs (meeting notes with their transcript) is an interview file only
 * when one of its tabs is the transcript ("Transcript", "Transcription"…).
 */
export const hasTranscriptTab = (tabs: readonly string[]): boolean =>
  tabs.some((title) => /transcri/i.test(title))

/** FR-013: transcripts (documents, text, subtitles), media (audio, video), everything else. */
export const classifyFile = (file: { name: string; mimeType: string }): FileKind => {
  if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) return 'media'
  if (TRANSCRIPT_MIME.has(file.mimeType)) return 'transcript'
  const name = file.name.toLowerCase()
  return TRANSCRIPT_EXTENSIONS.some((ext) => name.endsWith(ext)) ? 'transcript' : 'other'
}
