import { BEST_PRACTICES } from '@goodresearch/shared'
import type { DocBlock, DocModel, Items, Language } from './model.ts'

const plain = (text: string) => text.replace(/\*\*/g, '')

/** The best practices as a document (spec 006 content); fixed content, never read back. */
export const renderPractices = (language: Language): DocModel => {
  const doc = BEST_PRACTICES[language]
  const blocks: DocBlock[] = [
    { kind: 'heading', level: 1, text: doc.title },
    { kind: 'paragraph', text: plain(doc.intro) },
  ]
  for (const s of doc.sections) {
    blocks.push({ kind: 'heading', level: s.level === 3 ? 3 : 2, text: s.heading })
    for (const b of s.blocks) {
      if ('p' in b) blocks.push({ kind: 'paragraph', text: plain(b.p) })
      else
        for (const item of 'list' in b ? b.list : b.checklist)
          blocks.push({ kind: 'listItem', level: 0, text: plain(item) })
    }
  }
  return { blocks }
}

/** One item: the whole text. Changes in Drive are reported, never brought back (spec 007 FR-011). */
export const practicesItems = (doc: DocModel): Items =>
  new Map([['content', { type: 'unread', text: doc.blocks.map((b) => b.text).join('\n') }]])
