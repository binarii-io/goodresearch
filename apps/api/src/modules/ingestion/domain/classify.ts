export type FileKind = 'transcript' | 'media' | 'other'

const TRANSCRIPT_MIME = new Set([
  'application/vnd.google-apps.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/vtt',
  'application/x-subrip',
])
const TRANSCRIPT_EXTENSIONS = ['.doc', '.docx', '.txt', '.vtt', '.srt']

/** FR-013: transcripts (documents, text, subtitles), media (audio, video), everything else. */
export const classifyFile = (file: { name: string; mimeType: string }): FileKind => {
  if (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')) return 'media'
  if (TRANSCRIPT_MIME.has(file.mimeType)) return 'transcript'
  const name = file.name.toLowerCase()
  return TRANSCRIPT_EXTENSIONS.some((ext) => name.endsWith(ext)) ? 'transcript' : 'other'
}
