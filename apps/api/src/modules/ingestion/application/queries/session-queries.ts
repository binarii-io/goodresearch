import { err, ok, type Result } from '@goodresearch/shared'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { suggestLink } from '../../domain/link-suggestion.ts'
import {
  givesUpRecordings,
  personDecided,
  SESSION_LIMIT,
  type Session,
} from '../../domain/session.ts'
import { resolveStudyAccess } from '../access.ts'
import type { Actor, IngestionDeps, PlannedSummary } from '../ports.ts'

type FileView = {
  readonly fileId: string
  readonly name: string
  readonly mimeType: string
  readonly group: string
  readonly modifiedAt: string | null
  readonly webLink: string
}

type PlannedView = {
  readonly plannedInterviewId: string
  readonly interviewee: string
  readonly interviewers: string
  readonly scheduledAt: string | null
  readonly status: PlannedSummary['status']
  readonly version: number
}

export type SessionView = {
  readonly id: string
  readonly state: Session['state']
  readonly title: string | null
  readonly defaultTitle: string
  readonly transcript: FileView | null
  /** A recording found without its transcript (spec 008: shown with a warning). */
  readonly noTranscript: boolean
  readonly fileMissing: boolean
  readonly media: (FileView & { confidence: 'high' | 'medium' | 'low' | null; reason: string })[]
  readonly mediaEdited: boolean
  readonly link: (PlannedView & { linkedBy: 'suggestion' | 'person' }) | null
  readonly suggestion: (PlannedView & { rule: 'name' | 'date' }) | null
  readonly roster: Session['roster'][number][]
  readonly excludedReason: string | null
  readonly decidedBy: { id: string; name: string | null } | null
  readonly decidedAt: string | null
  readonly version: number
}

export type FieldworkView = {
  readonly sessions: SessionView[]
  readonly unmatchedMedia: FileView[]
  readonly plannedWithoutSession: {
    id: string
    interviewee: string
    scheduledAt: string | null
    status: PlannedSummary['status']
  }[]
  readonly totals: Record<Session['state'], number>
  readonly skipped: number
}

type Denied = 'STUDY_NOT_FOUND' | 'FOLDER_ACCESS_REQUIRED' | 'NOT_AN_INTERVIEW_STUDY'

const fileView = (f: InventoryFile): FileView => ({
  fileId: f.id,
  name: f.name,
  mimeType: f.mimeType,
  group: f.group,
  modifiedAt: f.modifiedAt,
  webLink: f.webViewLink,
})

const plannedView = (p: PlannedSummary): PlannedView => ({
  plannedInterviewId: p.id,
  interviewee: p.interviewee,
  interviewers: p.interviewers,
  scheduledAt: p.scheduledAt,
  status: p.status,
  version: p.version,
})

const withoutExtension = (name: string) => name.replace(/\.[^./]{1,5}$/, '')

/**
 * Spec 008: what the Fieldwork phase shows. Suggestions are computed here from the schedule and
 * never stored (research R4); a link to a planned interview no longer in the schedule reads as none.
 */
export const makeSessionQueries = (deps: IngestionDeps) => {
  /** `backfill`: place files no session holds yet (the list only, never a single session). */
  const build = async (accountId: string, studyId: string, backfill: boolean) => {
    let [sessions, files, read] = await Promise.all([
      deps.store.listSessions(studyId),
      deps.store.listFiles(studyId, {}),
      deps.schedule.list(accountId, studyId),
    ])
    // Files of the inventory that no session holds yet (an inventory taken before sessions, or
    // before recordings without transcript got their own row): propose them now (SC-001).
    const placed = new Set(
      sessions.flatMap((x) => [
        ...(x.transcriptFileId ? [x.transcriptFileId] : []),
        ...x.media.map((m) => m.fileId),
      ]),
    )
    if (
      backfill &&
      sessions.length < SESSION_LIMIT &&
      files.some((f) => f.kind !== 'other' && !placed.has(f.id))
    ) {
      await deps.store.backfillSessions(studyId, deps.clock.now())
      sessions = await deps.store.listSessions(studyId)
    }
    const planned = read ?? []
    const fileById = new Map(files.map((f) => [f.id, f]))
    const plannedById = new Map(planned.map((p) => [p.id, p]))
    const linkOf = (s: Session) =>
      s.plannedInterviewId ? (plannedById.get(s.plannedInterviewId) ?? null) : null
    const held = new Set(sessions.flatMap((s) => (linkOf(s) ? [s.plannedInterviewId] : [])))
    const free = planned.filter((p) => !held.has(p.id))

    const names = await deps.store.accountNames(
      sessions.flatMap((x) => (x.decidedBy ? [x.decidedBy] : [])),
    )
    const view = (s: Session): SessionView => {
      const transcript = s.transcriptFileId ? fileById.get(s.transcriptFileId) : undefined
      const recordings = s.media.flatMap((m) => {
        const f = fileById.get(m.fileId)
        return f ? [{ ...fileView(f), confidence: m.confidence, reason: m.reason }] : []
      })
      // Without a transcript, the first recording names and dates the interview.
      const anchor = transcript ?? (recordings[0] ? fileById.get(recordings[0].fileId) : undefined)
      const linked = linkOf(s)
      const hint = !personDecided(s) && !linked && anchor ? suggestLink(anchor, free) : null
      const suggested = hint ? plannedById.get(hint.plannedInterviewId) : undefined
      return {
        id: s.id,
        state: s.state,
        title: s.title,
        defaultTitle: linked?.interviewee ?? (anchor ? withoutExtension(anchor.name) : s.id),
        transcript: transcript ? fileView(transcript) : null,
        noTranscript: s.transcriptFileId === null,
        fileMissing: s.transcriptFileId !== null ? !transcript : recordings.length === 0,
        media: recordings,
        mediaEdited: s.mediaEdited,
        link: linked ? { ...plannedView(linked), linkedBy: s.linkedBy ?? 'person' } : null,
        suggestion: hint && suggested ? { ...plannedView(suggested), rule: hint.rule } : null,
        roster: [...s.roster],
        excludedReason: s.excludedReason,
        decidedBy: s.decidedBy ? { id: s.decidedBy, name: names.get(s.decidedBy) ?? null } : null,
        decidedAt: s.decidedAt?.toISOString() ?? null,
        version: s.version,
      }
    }
    return { sessions, files, planned, held, view }
  }

  const gate = async (accountId: string, studyId: string): Promise<Result<true, Denied>> => {
    const access = await resolveStudyAccess(deps, accountId, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (access.kind !== 'full') return err('FOLDER_ACCESS_REQUIRED')
    return access.type === 'interviews' ? ok(true) : err('NOT_AN_INTERVIEW_STUDY')
  }

  return {
    fieldwork: async (actor: Actor, studyId: string): Promise<Result<FieldworkView, Denied>> => {
      const allowed = await gate(actor.id, studyId)
      if (!allowed.ok) return allowed
      const { sessions, files, planned, held, view } = await build(actor.id, studyId, true)
      const fileAt = new Map(files.map((f) => [f.id, f.modifiedAt]))
      const at = (s: Session) =>
        fileAt.get(s.transcriptFileId ?? s.media[0]?.fileId ?? '') ?? s.createdAt.toISOString()
      const sorted = [...sessions].sort((a, b) => at(b).localeCompare(at(a)))
      const used = new Set(
        sessions.flatMap((s) => [
          ...(s.transcriptFileId ? [s.transcriptFileId] : []),
          ...s.media.map((m) => m.fileId),
        ]),
      )
      // Recordings a person can add to an interview: free ones, and those of rows without
      // transcript that no person decided (the row gives them up).
      const lone = new Set(
        sessions.filter(givesUpRecordings).flatMap((s) => s.media.map((m) => m.fileId)),
      )
      const totals = { proposed: 0, validated: 0, excluded: 0 }
      for (const s of sessions) totals[s.state]++
      return ok({
        sessions: sorted.map(view),
        unmatchedMedia: files
          .filter((f) => f.kind === 'media' && (!used.has(f.id) || lone.has(f.id)))
          .map(fileView),
        plannedWithoutSession: planned
          .filter((p) => !held.has(p.id))
          .map((p) => ({
            id: p.id,
            interviewee: p.interviewee,
            scheduledAt: p.scheduledAt,
            status: p.status,
          })),
        totals,
        // Transcripts left out only once the study reached its limit.
        skipped:
          sessions.length >= SESSION_LIMIT
            ? files.filter((f) => f.kind !== 'other' && !used.has(f.id)).length
            : 0,
      })
    },

    session: async (
      actor: Actor,
      sessionId: string,
    ): Promise<Result<SessionView, Denied | 'SESSION_NOT_FOUND'>> => {
      const s = await deps.store.getSession(sessionId)
      if (!s) return err('SESSION_NOT_FOUND')
      const allowed = await gate(actor.id, s.studyId)
      if (!allowed.ok)
        return allowed.error === 'STUDY_NOT_FOUND' ? err('SESSION_NOT_FOUND') : allowed
      return ok((await build(actor.id, s.studyId, false)).view(s))
    },
  }
}

export type SessionQueries = ReturnType<typeof makeSessionQueries>
