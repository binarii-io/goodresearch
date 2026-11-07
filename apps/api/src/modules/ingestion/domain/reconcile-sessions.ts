import { isVideo } from './classify.ts'
import type { InventoryFile } from './inventory-walk.ts'
import { type MediaMatch, matchMedia } from './media-matching.ts'
import { personDecided, SESSION_LIMIT, type Session } from './session.ts'

export type Reconciliation = {
  readonly created: readonly Session[]
  /** Proposed sessions whose transcript or recording is gone, or whose recording found its transcript. */
  readonly removed: readonly string[]
  /** Proposed sessions whose recordings changed. */
  readonly media: readonly { id: string; media: readonly MediaMatch[] }[]
  /** Spec 037: proposed test sessions whose transcript changed. */
  readonly transcripts: readonly { id: string; transcriptFileId: string | null }[]
}

/** What anchors the sessions of a study: transcripts (interviews), videos (usability tests). */
export type SessionMode = 'transcripts' | 'videos'

/** Interviews and usability tests have sessions; surveys have none (spec 037). */
export const sessionModeOf = (type: string | null | undefined): SessionMode | false =>
  type === 'interviews' ? 'transcripts' : type === 'usability-test' ? 'videos' : false

/** The study types whose Fieldwork lists sessions. */
export const hasSessions = (type: string | null | undefined): boolean =>
  sessionModeOf(type) !== false

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
  s.roster.length === 0 &&
  s.interviewDate === null &&
  s.language === null &&
  s.attachments.length === 0

const fresh = (studyId: string, id: string, now: Date): Session => ({
  id,
  studyId,
  transcriptFileId: null,
  videoFileId: null,
  protocolVersion: null,
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
  interviewDate: null,
  language: null,
  attachments: [],
  analysis: null,
  createdAt: now,
  updatedAt: now,
  version: 1,
})

/**
 * The sessions after an inventory (research R2). Sessions a person decided never change. Others go
 * with their transcript; each transcript nobody holds becomes a proposed session, to validate by a
 * person (spec 009: nothing is validated by the app). Recordings are
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
    // A person validates every interview (spec 009 FR-020).
    .map((f) => ({ ...fresh(studyId, input.newId(), now), transcriptFileId: f.id }))
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
    transcripts: [],
  }
}

/**
 * Spec 037 (research R3): the test sessions after an inventory. Each video no session holds gives
 * a proposed session; transcripts and audio of the same group go to the video they match best
 * (the interview policy, a tie leaves the file alone); a session holds one transcript at most.
 * Decided sessions never change; a session a person changed keeps its files while they exist.
 * A transcript no video claims gives no session (the view lists it).
 */
export const reconcileVideoSessions = (input: {
  readonly studyId: string
  readonly files: readonly InventoryFile[]
  readonly sessions: readonly Session[]
  readonly now: Date
  readonly newId: () => string
}): Reconciliation => {
  const { files, sessions, now, studyId } = input
  const byId = new Map(files.map((f) => [f.id, f]))
  const videoIn = (id: string | null) => {
    const f = id ? byId.get(id) : undefined
    return f?.kind === 'media' && isVideo(f.mimeType)
  }
  const removed = sessions
    .filter((s) => !personDecided(s) && !videoIn(s.videoFileId))
    .map((s) => s.id)
  const gone = new Set(removed)
  const kept = sessions.filter((s) => !gone.has(s.id))
  const decided = kept.filter(personDecided)
  const chosen = kept.filter((s) => !personDecided(s) && s.mediaEdited)
  const open = kept.filter((s) => !personDecided(s) && !s.mediaEdited)

  // Files of decided sessions are frozen; the ones a person chose come next.
  const taken = new Set<string>()
  const hold = (s: Session) => {
    for (const id of [s.videoFileId, s.transcriptFileId, ...s.media.map((m) => m.fileId)])
      if (id) taken.add(id)
  }
  for (const s of decided) hold(s)
  for (const s of kept) if (s.videoFileId) taken.add(s.videoFileId)
  const transcripts: { id: string; transcriptFileId: string | null }[] = []
  const media: { id: string; media: readonly MediaMatch[] }[] = []
  for (const s of chosen) {
    const still = s.media.filter(
      (m) => byId.get(m.fileId)?.kind === 'media' && !taken.has(m.fileId),
    )
    const transcript =
      s.transcriptFileId &&
      byId.get(s.transcriptFileId)?.kind === 'transcript' &&
      !taken.has(s.transcriptFileId)
        ? s.transcriptFileId
        : null
    hold({ ...s, transcriptFileId: transcript, media: still })
    if (transcript !== s.transcriptFileId)
      transcripts.push({ id: s.id, transcriptFileId: transcript })
    if (!sameMedia(s.media, still)) media.push({ id: s.id, media: still })
  }

  const room = Math.max(0, SESSION_LIMIT - kept.length)
  const created: Session[] = files
    .filter((f) => f.kind === 'media' && isVideo(f.mimeType) && !taken.has(f.id))
    .sort(newestFirst)
    .slice(0, room)
    .map((f) => ({ ...fresh(studyId, input.newId(), now), videoFileId: f.id }))

  const anchored = [...open, ...created].flatMap((s) => {
    const file = s.videoFileId ? byId.get(s.videoFileId) : undefined
    return file ? [{ key: s.id, file }] : []
  })
  const free = (kind: InventoryFile['kind']) =>
    files.filter(
      (f) => f.kind === kind && !taken.has(f.id) && (kind !== 'media' || !isVideo(f.mimeType)),
    )
  // The same policy, from the video: each transcript goes to its best video; a video keeps the
  // best of the transcripts that chose it.
  const byTranscript = matchMedia(anchored, free('transcript'), files)
  const audio = matchMedia(anchored, free('media'), files)
  const RANK = { high: 3, medium: 2, low: 1 } as const
  const best = (list: readonly MediaMatch[]) =>
    [...list].sort(
      (a, b) =>
        RANK[b.confidence ?? 'low'] +
        (b.reason === 'same-meeting' ? 1 : 0) -
        (RANK[a.confidence ?? 'low'] + (a.reason === 'same-meeting' ? 1 : 0)),
    )[0]?.fileId ?? null

  for (const s of open) {
    const transcript = best(byTranscript.get(s.id) ?? [])
    const next = audio.get(s.id) ?? []
    if (transcript !== s.transcriptFileId)
      transcripts.push({ id: s.id, transcriptFileId: transcript })
    if (!sameMedia(s.media, next)) media.push({ id: s.id, media: next })
  }
  return {
    created: created.map((s) => ({
      ...s,
      transcriptFileId: best(byTranscript.get(s.id) ?? []),
      media: audio.get(s.id) ?? [],
    })),
    removed,
    media,
    transcripts,
  }
}

/** The sessions after an inventory, by what anchors them. */
export const reconcileStudy = (
  mode: SessionMode,
  input: Parameters<typeof reconcileSessions>[0],
): Reconciliation => (mode === 'videos' ? reconcileVideoSessions(input) : reconcileSessions(input))
