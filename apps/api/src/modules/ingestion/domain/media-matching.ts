import { fileWords, meetingOf, rareWords } from './file-words.ts'
import type { InventoryFile } from './inventory-walk.ts'

export type Confidence = 'high' | 'medium' | 'low'

export type MediaMatch = {
  readonly fileId: string
  /** `null`: added by a person. */
  readonly confidence: Confidence | null
  /** `same-meeting`, `same-time`, `close-time`, `shared-word:<word>`, `person` or `alone`. */
  readonly reason: string
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const time = (iso: string | null): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

const sameDay = (a: number, b: number) =>
  new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10)

/** How well a recording goes with a transcript of the same group (context map, matching policy). */
export const confidenceOf = (
  transcript: InventoryFile,
  media: InventoryFile,
  rare: ReadonlySet<string>,
): { confidence: Confidence; reason: string } | null => {
  if (transcript.group !== media.group) return null
  // The same meeting by its names ("Title - 2026/10/21 15:02 CEST - Recording" and "… - Notes"):
  // file dates are upload times, often a day apart, so names come first. Without a time in the
  // names, the title must say something (not just "Interview") and the files be days apart at most.
  const t = meetingOf(transcript.name)
  const m = meetingOf(media.name)
  if (t.title !== '' && t.title === m.title) {
    if (t.at !== null && m.at !== null && Math.abs(t.at - m.at) <= 5)
      return { confidence: 'high', reason: 'same-meeting' }
    const a = time(transcript.modifiedAt)
    const b = time(media.modifiedAt)
    if (
      t.at === null &&
      m.at === null &&
      fileWords(t.title).size > 0 &&
      (a === null || b === null || Math.abs(a - b) <= 3 * DAY)
    )
      return { confidence: 'high', reason: 'same-meeting' }
  }
  const shared = [...fileWords(transcript.name)].find(
    (w) => rare.has(w) && fileWords(media.name).has(w),
  )
  const a = time(transcript.modifiedAt)
  const b = time(media.modifiedAt)
  if (a !== null && b !== null) {
    // Different days never pair, even a few minutes apart around midnight (UTC days).
    if (!sameDay(a, b)) return null
    const gap = Math.abs(a - b)
    if (gap <= MINUTE) return { confidence: 'high', reason: 'same-time' }
    if (gap <= 15 * MINUTE) return { confidence: 'medium', reason: 'close-time' }
    return shared ? { confidence: 'medium', reason: `shared-word:${shared}` } : null
  }
  return shared ? { confidence: 'low', reason: `shared-word:${shared}` } : null
}

/**
 * Each recording goes to the transcript it matches best; a tie on the best leaves it unmatched.
 * `groupFiles` are all the files of the inventory, for the rare words of each group.
 */
export const matchMedia = (
  transcripts: readonly { key: string; file: InventoryFile }[],
  media: readonly InventoryFile[],
  groupFiles: readonly InventoryFile[],
): ReadonlyMap<string, MediaMatch[]> => {
  const rareByGroup = new Map<string, ReadonlySet<string>>()
  const rareOf = (group: string) => {
    let rare = rareByGroup.get(group)
    if (!rare) {
      rare = rareWords(groupFiles.filter((f) => f.group === group).map((f) => f.name))
      rareByGroup.set(group, rare)
    }
    return rare
  }
  const result = new Map<string, MediaMatch[]>(transcripts.map((t) => [t.key, []]))
  for (const m of media) {
    let best: { keys: string[]; rank: number; match: MediaMatch } | null = null
    for (const t of transcripts) {
      const c = confidenceOf(t.file, m, rareOf(m.group))
      if (!c) continue
      // The same meeting by name wins over a close time: several files are often saved together.
      const rank = RANK[c.confidence] + (c.reason === 'same-meeting' ? 1 : 0)
      if (!best || rank > best.rank) best = { keys: [t.key], rank, match: { fileId: m.id, ...c } }
      else if (rank === best.rank) best.keys.push(t.key)
    }
    if (best && best.keys.length === 1) result.get(best.keys[0] as string)?.push(best.match)
  }
  return result
}
