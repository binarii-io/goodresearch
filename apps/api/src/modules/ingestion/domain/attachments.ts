import { fileWords, meetingOf, rareWords } from './file-words.ts'
import type { InventoryFile } from './inventory-walk.ts'
import type { Session } from './session.ts'

/** At most this many files attached to one interview (spec 009 data model). */
export const ATTACHMENT_LIMIT = 20

/**
 * Research R11: the "other" files of the interview's group that seem to belong to it, by the
 * meeting title of their names or a rare word shared with its files (no AI). `held`: files another
 * interview already holds.
 */
export const attachmentCandidates = (
  session: Session,
  files: readonly InventoryFile[],
  held: ReadonlySet<string>,
): { fileId: string; reason: string }[] => {
  const byId = new Map(files.map((f) => [f.id, f]))
  const own = [session.transcriptFileId, ...session.media.map((m) => m.fileId)]
    .flatMap((id) => (id ? [byId.get(id)] : []))
    .filter((f): f is InventoryFile => f !== undefined)
  const group = own[0]?.group
  if (group === undefined) return []
  const inGroup = files.filter((f) => f.group === group)
  const rare = rareWords(inGroup.map((f) => f.name))
  const titles = new Set(own.map((f) => meetingOf(f.name).title).filter((t) => t !== ''))
  const words = new Set(own.flatMap((f) => [...fileWords(f.name)]))
  const attached = new Set(session.attachments.map((a) => a.fileId))
  const out: { fileId: string; reason: string }[] = []
  for (const f of inGroup) {
    if (f.kind !== 'other' || held.has(f.id) || attached.has(f.id)) continue
    if (titles.has(meetingOf(f.name).title)) {
      out.push({ fileId: f.id, reason: 'same-meeting' })
      continue
    }
    const shared = [...fileWords(f.name)].filter((w) => rare.has(w) && words.has(w)).sort()
    if (shared[0]) out.push({ fileId: f.id, reason: `shared-word:${shared[0]}` })
  }
  return out
}
