import type { InventoryFile } from './inventory-walk.ts'
import { type MediaMatch, matchMedia } from './media-matching.ts'
import { personDecided, SESSION_LIMIT, type Session } from './session.ts'

export type Reconciliation = {
  readonly created: readonly Session[]
  /** Proposed sessions whose transcript or recording is gone, or whose recording found its transcript. */
  readonly removed: readonly string[]
  /** Proposed sessions whose recordings changed. */
  readonly media: readonly { id: string; media: readonly MediaMatch[] }[]
}

const newestFirst = (a: InventoryFile, b: InventoryFile) =>
  (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '') || a.name.localeCompare(b.name)

const sameMedia = (a: readonly MediaMatch[], b: readonly MediaMatch[]) =>
  a.length === b.length &&
  a.every((m, i) => {
    const o = b[i]
    return o && o.fileId === m.fileId && o.confidence === m.confidence && o.reason === m.reason
  })

/**
 * A session without transcript that nobody touched: the app made it for a lone recording, and
 * remakes it at each inventory (the recording may meanwhile have found its transcript).
 */
export const isLoneRecording = (s: Session): boolean =>
  s.state === 'proposed' &&
  s.transcriptFileId === null &&
  !s.mediaEdited &&
  s.title === null &&
  s.plannedInterviewId === null &&
  s.roster.length === 0

const fresh = (studyId: string, id: string, now: Date): Session => ({
  id,
  studyId,
  transcriptFileId: null,
  media: [],
  mediaEdited: false,
  state: 'proposed',
  excludedReason: null,
  title: null,
  plannedInterviewId: null,
  linkedBy: null,
  roster: [],
  decidedBy: null,
  decidedAt: null,
  createdAt: now,
  updatedAt: now,
  version: 1,
})

/**
 * The sessions after an inventory (research R2). Sessions a person decided never change. Others go
 * with their transcript; each transcript nobody holds becomes a session validated by the app. Recordings are
 * matched again for proposed sessions, except the ones a person chose, which stay while they exist.
 * A recording no transcript claims becomes a session of its own, without transcript (shown with a
 * warning). Newest first, at most SESSION_LIMIT sessions per study.
 */
export const reconcileSessions = (input: {
  readonly studyId: string
  readonly files: readonly InventoryFile[]
  readonly sessions: readonly Session[]
  readonly now: Date
  readonly newId: () => string
}): Reconciliation => {
  const { files, sessions, now, studyId } = input
  const byId = new Map(files.map((f) => [f.id, f]))
  const isMedia = (id: string) => byId.get(id)?.kind === 'media'
  const lone = sessions.filter(isLoneRecording)
  const removed = new Set(
    sessions
      .filter(
        (s) =>
          !personDecided(s) &&
          !isLoneRecording(s) &&
          (s.transcriptFileId === null
            ? !s.media.some((m) => isMedia(m.fileId))
            : byId.get(s.transcriptFileId)?.kind !== 'transcript'),
      )
      .map((s) => s.id),
  )
  // Lone recordings are rebuilt below; the others stay.
  const kept = sessions.filter((s) => !removed.has(s.id) && !isLoneRecording(s))
  const held = new Set(kept.flatMap((s) => (s.transcriptFileId ? [s.transcriptFileId] : [])))
  let room = Math.max(0, SESSION_LIMIT - kept.length)
  const created: Session[] = files
    .filter((f) => f.kind === 'transcript' && !held.has(f.id))
    .sort(newestFirst)
    .slice(0, room)
    // An interview with its transcript is validated by the app; a person can still undo it.
    .map((f) => ({
      ...fresh(studyId, input.newId(), now),
      transcriptFileId: f.id,
      state: 'validated' as const,
      decidedAt: now,
    }))
  room -= created.length

  // Recordings of decided sessions are frozen; the ones a person chose come next.
  const taken = new Set<string>()
  for (const s of kept) if (personDecided(s)) for (const m of s.media) taken.add(m.fileId)
  const chosen = new Map<string, MediaMatch[]>()
  for (const s of kept)
    if (!personDecided(s) && (s.mediaEdited || s.transcriptFileId === null)) {
      const still = s.media.filter((m) => isMedia(m.fileId) && !taken.has(m.fileId))
      for (const m of still) taken.add(m.fileId)
      chosen.set(s.id, still)
    }

  const open = [...kept.filter((s) => !personDecided(s) && !chosen.has(s.id)), ...created]
  const free = files.filter((f) => f.kind === 'media' && !taken.has(f.id))
  const matched = matchMedia(
    open.flatMap((s) => {
      const file = s.transcriptFileId ? byId.get(s.transcriptFileId) : undefined
      return file ? [{ key: s.id, file }] : []
    }),
    free,
    files,
  )
  const claimed = new Set([...matched.values()].flatMap((list) => list.map((m) => m.fileId)))

  // Each recording left alone keeps (or gets) its own session.
  const loneByFile = new Map(lone.map((s) => [s.media[0]?.fileId ?? '', s]))
  const alone = free.filter((f) => !claimed.has(f.id)).sort(newestFirst)
  const keptLone = new Set<string>()
  for (const f of alone) {
    const existing = loneByFile.get(f.id)
    // Rows of their own count against the limit too; transcripts come first.
    if (room <= 0) break
    room--
    if (existing) keptLone.add(existing.id)
    else {
      created.push({
        ...fresh(studyId, input.newId(), now),
        media: [{ fileId: f.id, confidence: null, reason: 'alone' }],
      })
    }
  }
  for (const s of lone) if (!keptLone.has(s.id)) removed.add(s.id)

  const media: { id: string; media: readonly MediaMatch[] }[] = []
  for (const s of kept) {
    if (personDecided(s)) continue
    const next = chosen.get(s.id) ?? matched.get(s.id) ?? []
    if (!sameMedia(s.media, next)) media.push({ id: s.id, media: next })
  }
  return {
    created: created.map((s) =>
      s.transcriptFileId ? { ...s, media: matched.get(s.id) ?? [] } : s,
    ),
    removed: [...removed],
    media,
  }
}
