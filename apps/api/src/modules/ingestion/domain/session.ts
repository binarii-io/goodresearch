import { err, ok, type Result } from '@goodresearch/shared'
import type { MediaMatch } from './media-matching.ts'

export type SessionState = 'proposed' | 'validated' | 'excluded'

export type RosterEntry = {
  readonly id: string
  readonly name: string
  readonly role: 'interviewer' | 'interviewee'
  readonly memberId: string | null
}

/** One interview occurrence of a study (context map, Session); labelled "Interview" in the UI. */
export type Session = {
  readonly id: string
  readonly studyId: string
  /** `null`: a recording without its transcript (shown with a warning). */
  readonly transcriptFileId: string | null
  readonly media: readonly MediaMatch[]
  /** Once a person changed the recordings, a refresh keeps them (research R2). */
  readonly mediaEdited: boolean
  readonly state: SessionState
  readonly excludedReason: string | null
  readonly title: string | null
  readonly plannedInterviewId: string | null
  readonly linkedBy: 'suggestion' | 'person' | null
  readonly roster: readonly RosterEntry[]
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly version: number
}

/** At most this many sessions per study (spec 008 FR-002). */
export const SESSION_LIMIT = 500
export const TITLE_MAX = 120
export const REASON_MAX = 500
export const ROSTER_MAX = 10
export const NAME_MAX = 120

export type Decision = 'validate' | 'exclude' | 'reopen'

/**
 * A person's decision (validated or excluded by someone) freezes the session. A session validated
 * by the app (an interview with its transcript, spec 008) stays open to changes until a person
 * decides.
 */
export const personDecided = (s: Session): boolean => s.state !== 'proposed' && s.decidedBy !== null

/**
 * A row without transcript that no person decided gives up its recordings to an interview that
 * takes them; it goes once it has none left (a person's decision is never undone silently).
 */
export const givesUpRecordings = (s: Session): boolean =>
  s.transcriptFileId === null && !personDecided(s)

/** The session without the given recordings, or null when it has none left. */
export const withoutRecordings = (
  s: Session,
  fileIds: ReadonlySet<string>,
  now: Date,
): Session | null => {
  const media = s.media.filter((m) => !fileIds.has(m.fileId))
  return media.length ? { ...s, media, mediaEdited: true, updatedAt: now } : null
}

export const decide = (
  s: Session,
  decision: Decision,
  by: string,
  now: Date,
  reason?: string,
): Result<Session, 'INVALID_TRANSITION' | 'VALIDATION'> => {
  if (decision === 'reopen') {
    if (s.state === 'proposed') return err('INVALID_TRANSITION')
    return ok({
      ...s,
      state: 'proposed',
      excludedReason: null,
      decidedBy: null,
      decidedAt: null,
      updatedAt: now,
    })
  }
  if (personDecided(s)) return err('INVALID_TRANSITION')
  const why = reason?.trim() ?? ''
  if (why.length > REASON_MAX) return err('VALIDATION')
  return ok({
    ...s,
    state: decision === 'validate' ? 'validated' : 'excluded',
    excludedReason: decision === 'exclude' && why ? why : null,
    decidedBy: by,
    decidedAt: now,
    updatedAt: now,
  })
}

export type RosterInput = {
  readonly id?: string | undefined
  readonly name: string
  readonly role: RosterEntry['role']
  readonly memberId?: string | null | undefined
}

/** Entries keep their id; new ones get one, so later phases can refer to a person (research R8). */
export const rosterOf = (
  input: readonly RosterInput[],
  current: readonly RosterEntry[],
  newId: () => string,
): Result<RosterEntry[], 'VALIDATION'> => {
  if (input.length > ROSTER_MAX) return err('VALIDATION')
  const known = new Set(current.map((r) => r.id))
  const entries: RosterEntry[] = []
  for (const r of input) {
    const name = r.name.trim()
    if (name.length < 1 || name.length > NAME_MAX) return err('VALIDATION')
    entries.push({
      id: r.id && known.has(r.id) ? r.id : newId(),
      name,
      role: r.role,
      memberId: r.role === 'interviewer' ? (r.memberId ?? null) : null,
    })
  }
  return ok(entries)
}

export type Edit = {
  readonly title?: string | null | undefined
  /** File ids of the recordings, in order. */
  readonly media?: readonly string[] | undefined
  readonly roster?: readonly RosterEntry[] | undefined
}

/**
 * Title, recordings and people change only while the session is proposed (FR-008). `available` are
 * the recordings that no other session holds and the ones already in this session.
 */
export const edit = (
  s: Session,
  change: Edit,
  available: ReadonlySet<string>,
  now: Date,
): Result<Session, 'SESSION_DECIDED' | 'MEDIA_UNAVAILABLE' | 'VALIDATION'> => {
  if (personDecided(s)) return err('SESSION_DECIDED')
  let next: Session = { ...s, updatedAt: now }
  if (change.title !== undefined) {
    const title = change.title?.trim() ?? ''
    if (title.length > TITLE_MAX) return err('VALIDATION')
    next = { ...next, title: title || null }
  }
  const sameMedia =
    change.media !== undefined &&
    change.media.length === s.media.length &&
    change.media.every((id, i) => s.media[i]?.fileId === id)
  // Recordings sent back unchanged are not a choice: the app keeps matching them (PR #8 review).
  if (change.media !== undefined && !sameMedia) {
    const ids = [...new Set(change.media)]
    if (ids.some((id) => !available.has(id))) return err('MEDIA_UNAVAILABLE')
    // A session holds at least one file.
    if (s.transcriptFileId === null && ids.length === 0) return err('VALIDATION')
    const previous = new Map(s.media.map((m) => [m.fileId, m]))
    next = {
      ...next,
      media: ids.map(
        (id) => previous.get(id) ?? { fileId: id, confidence: null, reason: 'person' },
      ),
      mediaEdited: true,
    }
  }
  if (change.roster !== undefined) next = { ...next, roster: change.roster }
  return ok(next)
}

/** Interviewers of a planned interview are a free text: "Ana, Bo & Cy" gives three people. */
const splitNames = (text: string): string[] =>
  text
    .split(/\s*(?:,|;|&|\/|\band\b|\bet\b)\s*/i)
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((n) => n.slice(0, NAME_MAX))

/** The people of a planned interview, when the link is made and nobody was entered yet (research R8). */
export const prefillRoster = (
  planned: { readonly interviewee: string; readonly interviewers: string },
  newId: () => string,
): RosterEntry[] =>
  [
    ...[planned.interviewee.trim().slice(0, NAME_MAX)]
      .filter((name) => name.length > 0)
      .map((name) => ({ name, role: 'interviewee' as const })),
    ...splitNames(planned.interviewers).map((name) => ({ name, role: 'interviewer' as const })),
  ]
    .slice(0, ROSTER_MAX)
    .map((r) => ({ id: newId(), ...r, memberId: null }))

export const link = (
  s: Session,
  plannedInterviewId: string | null,
  by: 'suggestion' | 'person',
  now: Date,
): Result<Session, 'SESSION_DECIDED'> =>
  personDecided(s)
    ? err('SESSION_DECIDED')
    : ok({
        ...s,
        plannedInterviewId,
        linkedBy: plannedInterviewId ? by : null,
        updatedAt: now,
      })
