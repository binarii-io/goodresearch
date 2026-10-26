import { strFromU8, unzipSync } from 'fflate'
import { TranscriptUnreadable } from '../domain/drive-gateway.ts'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)))
    return ENTITIES[entity] ?? whole
  })

/**
 * The text of a Word (.docx) file, one paragraph per line (spec 009 research R2): only
 * `word/document.xml` is unzipped, and only its text runs (`w:t`), tabs and breaks are kept.
 */
export const docxText = (bytes: Uint8Array): string => {
  let xml: string
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
    const document = files['word/document.xml']
    if (!document) throw new TranscriptUnreadable()
    xml = strFromU8(document)
  } catch {
    throw new TranscriptUnreadable()
  }
  return xml
    .split(/<\/w:p>/)
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab|br)\b[^>]*\/>/g)]
        .map((m) => (m[2] === 'tab' ? '\t' : m[2] === 'br' ? '\n' : decode(m[1] ?? '')))
        .join(''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
