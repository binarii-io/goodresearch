import { err, ok, type Result } from '@goodresearch/shared'
import { type Analysis, filesChanged, type Proposal, shownAnalysis } from '../../domain/analysis.ts'
import { fileNamesState } from '../../domain/file-names.ts'
import { fileWords, nameWords } from '../../domain/file-words.ts'
import type { InventoryFile } from '../../domain/inventory-walk.ts'
import { suggestLink } from '../../domain/link-suggestion.ts'
import {
  givesUpRecordings,
  personDecided,
  SESSION_LIMIT,
  type Session,
} from '../../domain/session.ts'
import { resolveStudyAccess } from '../access.ts'
import { analysisRef, isLive } from '../commands/analysis-commands.ts'
import type { Actor, AnalysisRun, IngestionDeps, PlannedSummary } from '../ports.ts'

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
  readonly suggestion: (PlannedView & { rule: 'transcript' | 'name' | 'date' }) | null
  readonly roster: Session['roster'][number][]
  readonly excludedReason: string | null
  readonly decidedBy: { id: string; name: string | null } | null
  readonly decidedAt: string | null
  readonly interviewDate: string | null
  readonly language: Session['language']
  readonly attachments: FileView[]
  readonly analysis: AnalysisView | null
  readonly cost: number | null
  /** Spec 009 FR-028: the files in Drive carry the accepted name; null before one is accepted. */
  readonly fileNames: { inSync: boolean; differing: number } | null
  readonly version: number
}

type ProposalView = {
  readonly field: Proposal['field']
  readonly people: { name: string; memberId: string | null }[] | null
  readonly text: string | null
  readonly attachment: (FileView & { reason: string }) | null
  readonly origin: Proposal['origin']
  readonly quote: string | null
  readonly otherDate: string | null
  readonly status: Proposal['status']
}

type AnalysisView = {
  readonly state: Analysis['state']
  readonly failure: Analysis['failure']
  readonly at: string | null
  readonly by: { id: string; name: string | null } | null
  readonly usedAi: boolean
  readonly filesChanged: boolean
  readonly proposals: ProposalView[]
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
  readonly analysisCost: number | null
  readonly run: {
    id: string
    state: AnalysisRun['state']
    stopRequested: boolean
    total: number
    done: number
    failed: number
    startedBy: { id: string; name: string | null }
  } | null
  readonly anonymised: boolean
  readonly namedFiles: number
  readonly consentNeeded: boolean
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

    const last = await deps.store.lastRun(studyId)
    const liveRunId = isLive(last, deps.clock.now()) ? last.id : null
    const [names, costs] = await Promise.all([
      deps.store.accountNames(
        sessions.flatMap((x) => [
          ...(x.decidedBy ? [x.decidedBy] : []),
          ...(x.analysis ? [x.analysis.by] : []),
        ]),
      ),
      deps.analyzer.costs(sessions.map((x) => analysisRef(x.id))),
    ])
    const proposalView = (p: Proposal): ProposalView => {
      const people = p.field === 'interviewees' || p.field === 'interviewers'
      const file = p.field === 'attachment' ? fileById.get(p.value.fileId) : undefined
      return {
        field: p.field,
        people: people ? p.value.map((v) => ({ name: v.name, memberId: v.memberId })) : null,
        text: p.field === 'date' || p.field === 'language' || p.field === 'name' ? p.value : null,
        attachment:
          p.field === 'attachment' && file ? { ...fileView(file), reason: p.value.reason } : null,
        origin: p.origin,
        quote: p.quote,
        otherDate: p.otherDate,
        status: p.status,
      }
    }
    const analysisView = (s: Session): AnalysisView | null => {
      const a = shownAnalysis(s.analysis, liveRunId)
      return a
        ? {
            state: a.state,
            failure: a.failure,
            at: a.at?.toISOString() ?? null,
            by: { id: a.by, name: names.get(a.by) ?? null },
            usedAi: a.usedAi,
            filesChanged: a.state === 'done' && filesChanged(s, fileById),
            // An attachment proposal whose file left the folder is not shown.
            proposals: a.proposals
              .filter((p) => p.field !== 'attachment' || fileById.has(p.value.fileId))
              .map(proposalView),
          }
        : null
    }
    const view = (s: Session): SessionView => {
      const transcript = s.transcriptFileId ? fileById.get(s.transcriptFileId) : undefined
      const recordings = s.media.flatMap((m) => {
        const f = fileById.get(m.fileId)
        return f ? [{ ...fileView(f), confidence: m.confidence, reason: m.reason }] : []
      })
      // Without a transcript, the first recording names and dates the interview.
      const anchor = transcript ?? (recordings[0] ? fileById.get(recordings[0].fileId) : undefined)
      const linked = linkOf(s)
      // Spec 009: the people and date the analysis found (accepted, else proposed) come first.
      const proposed = (s.analysis?.proposals ?? []).filter((p) => p.status !== 'rejected')
      const found = {
        names: [
          ...s.roster.filter((r) => r.role === 'interviewee').map((r) => r.name),
          ...proposed.flatMap((p) =>
            p.field === 'interviewees' ? p.value.map((v) => v.name) : [],
          ),
        ],
        date:
          s.interviewDate ??
          proposed.flatMap((p) =>
            p.field === 'date' && p.origin !== 'file-date' ? [p.value] : [],
          )[0] ??
          null,
      }
      const hint = !personDecided(s) && !linked && anchor ? suggestLink(anchor, free, found) : null
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
        interviewDate: s.interviewDate,
        language: s.language,
        attachments: s.attachments.flatMap((a) => {
          const f = fileById.get(a.fileId)
          return f ? [fileView(f)] : []
        }),
        analysis: analysisView(s),
        cost: costs.get(analysisRef(s.id)) ?? 0,
        fileNames: fileNamesState(s, files),
        version: s.version,
      }
    }
    return { sessions, files, planned, held, view, costs }
  }

  const gate = async (
    accountId: string,
    studyId: string,
  ): Promise<Result<{ anonymised: boolean }, Denied>> => {
    const access = await resolveStudyAccess(deps, accountId, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND')
    if (access.kind !== 'full') return err('FOLDER_ACCESS_REQUIRED')
    return access.type === 'interviews'
      ? ok({ anonymised: access.anonymised })
      : err('NOT_AN_INTERVIEW_STUDY')
  }

  /** Interviews whose file names hold a word of an interviewee's name (to rename, FR-013). */
  const named = (sessions: readonly Session[], fileById: ReadonlyMap<string, InventoryFile>) =>
    sessions.filter((s) => {
      const words = [
        ...s.roster.filter((r) => r.role === 'interviewee').map((r) => r.name),
        ...(s.analysis?.proposals ?? []).flatMap((p) =>
          p.field === 'interviewees' ? p.value.map((v) => v.name) : [],
        ),
      ].flatMap(nameWords)
      const ids = [s.transcriptFileId, ...s.media.map((m) => m.fileId)]
      return ids.some((id) => {
        const f = id ? fileById.get(id) : undefined
        const inName = f ? fileWords(f.name) : new Set<string>()
        return words.some((w) => inName.has(w))
      })
    }).length

  return {
    fieldwork: async (actor: Actor, studyId: string): Promise<Result<FieldworkView, Denied>> => {
      const allowed = await gate(actor.id, studyId)
      if (!allowed.ok) return allowed
      const { sessions, files, planned, held, view, costs } = await build(actor.id, studyId, true)
      const [last, provider] = await Promise.all([
        deps.store.lastRun(studyId),
        deps.analyzer.providerOf(actor.id),
      ])
      const run = isLive(last, deps.clock.now()) ? last : null
      const startedByName = run ? await deps.store.accountName(run.startedBy) : null
      const runSessions = run ? sessions.filter((s) => run.sessionIds.includes(s.id)) : []
      let analysisCost: number | null = 0
      for (const c of costs.values())
        analysisCost = analysisCost === null || c === null ? null : analysisCost + c
      // Newest found first, in a stable order: a file's date moves when it is renamed or edited in
      // Drive, and the row a person just worked on must not jump.
      const sorted = [...sessions].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
      )
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
        analysisCost,
        run: run
          ? {
              id: run.id,
              state: run.state,
              stopRequested: run.stopRequested,
              total: run.sessionIds.length,
              done: runSessions.filter(
                (s) => s.analysis?.runId !== run.id && s.analysis?.state === 'done',
              ).length,
              failed: runSessions.filter(
                (s) => s.analysis?.runId !== run.id && s.analysis?.state === 'failed',
              ).length,
              startedBy: { id: run.startedBy, name: startedByName },
            }
          : null,
        anonymised: allowed.value.anonymised,
        namedFiles: named(sessions, new Map(files.map((f) => [f.id, f]))),
        consentNeeded:
          provider !== null && !(await deps.store.hasConsent(actor.id, studyId, provider)),
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
