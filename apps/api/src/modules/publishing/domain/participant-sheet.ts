import { STANDARD_QUESTIONS } from '@goodresearch/shared'
import { LABELS } from './labels.ts'
import type { DocBlock, DocModel, Items } from './model.ts'
import { type ProtocolContent, susForm } from './protocol.ts'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * What a participant may see of a protocol (spec 036 FR-013a): the scenario, the numbered task
 * instructions with their start links and, when on, the System Usability Scale to fill in, in the
 * protocol's language; never a success criterion, the script, a duration or the facilitator's notes.
 */
export const renderParticipantSheet = (p: ProtocolContent, studyName: string): DocModel => {
  const l = LABELS[p.framing.language]
  const blocks: DocBlock[] = [
    { kind: 'heading', level: 1, text: `${l.participantSheet} · ${oneLine(studyName)}` },
  ]
  if (p.scenario.trim()) {
    blocks.push({ kind: 'heading', level: 2, text: l.scenario })
    for (const line of p.scenario.split('\n').map(oneLine).filter(Boolean))
      blocks.push({ kind: 'paragraph', text: line })
  }
  blocks.push({ kind: 'heading', level: 2, text: l.tasks })
  p.tasks.forEach((t, i) => {
    blocks.push({ kind: 'heading', level: 3, text: `${l.task} ${i + 1}` })
    blocks.push({ kind: 'paragraph', text: oneLine(t.instruction) })
    if (t.startUrl)
      blocks.push({ kind: 'paragraph', text: `${l.startsAt}: ${oneLine(t.startUrl)}` })
  })
  // The participant fills the System Usability Scale: it belongs on the sheet (Brooke, 1996).
  const sus = susForm(p)
  if (sus.length) {
    blocks.push({
      kind: 'heading',
      level: 2,
      text: STANDARD_QUESTIONS[p.framing.language]['sus-v1'].title,
    })
    for (const line of sus) blocks.push({ kind: 'paragraph', text: line })
  }
  return { blocks }
}

/** One item: the whole text. Published one way: a change made in Drive is reported, never taken in. */
export const sheetItems = (doc: DocModel): Items =>
  new Map([
    ['content', { type: 'unread', text: doc.blocks.map((b) => oneLine(b.text)).join('\n') }],
  ])
