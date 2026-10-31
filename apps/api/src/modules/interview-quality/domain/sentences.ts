import { words } from '@goodresearch/shared'

/** Research R2: an acknowledgement ("OK.", "I see.") is not a sentence. */
const FRAGMENT_WORDS = 2

/** Ends that do not end a sentence (compared without case). */
const ABBREVIATIONS = new Set([
  'e.g',
  'i.e',
  'etc',
  'vs',
  'dr',
  'mr',
  'mrs',
  'ms',
  'm',
  'mme',
  'cf',
])

export type Sentence = {
  /** `t3.2`: the turn's id in the chunk and the rank of the sentence, which is what the AI cites. */
  readonly id: string
  /** Where it starts in the text given. */
  readonly offset: number
  readonly length: number
  readonly text: string
}

const isAbbreviation = (before: string) => {
  const last = before.trimEnd().split(/\s+/).at(-1) ?? ''
  return ABBREVIATIONS.has(last.toLowerCase())
}

/** The app cuts the sentences, so that totals are reproducible and quotes exact (research R2). */
export const cutSentences = (turnId: string, text: string): Sentence[] => {
  const ends = [...text.matchAll(/[.?!…]+["»”)]*(?=\s|$)/gu)]
  const cuts: number[] = []
  for (const end of ends) {
    if (end[0].startsWith('.') && end[0].length === 1 && isAbbreviation(text.slice(0, end.index)))
      continue
    cuts.push(end.index + end[0].length)
  }
  if (cuts.at(-1) !== text.length) cuts.push(text.length)
  const out: Sentence[] = []
  let from = 0
  for (const cut of cuts) {
    const raw = text.slice(from, cut)
    const lead = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (words(trimmed).length > FRAGMENT_WORDS)
      out.push({
        id: `${turnId}.${out.length + 1}`,
        offset: from + lead,
        length: trimmed.length,
        text: trimmed,
      })
    from = cut
  }
  return out
}
