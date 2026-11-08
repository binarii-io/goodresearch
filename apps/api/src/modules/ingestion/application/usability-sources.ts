import { DriveConnectionLost, type DriveGateway } from '../domain/drive-gateway.ts'
import { nameKey } from '../domain/pseudonyms.ts'
import type { SessionReadiness } from '../domain/session-readiness.ts'
import { resolveStudyAccess } from './access.ts'
import type { AnalysisCommands } from './commands/analysis-commands.ts'
import { readRefreshToken } from './connection.ts'
import type { IngestionDeps } from './ports.ts'
import type { SessionQueries, SessionView } from './queries/session-queries.ts'

/** Spec 038: a test session as the video analysis reads it. */
export type UsabilitySession = {
  readonly sessionId: string
  readonly studyId: string
  readonly title: string
  readonly state: 'proposed' | 'validated' | 'excluded'
  /** As the Fieldwork view computes it (spec 037). */
  readonly readiness: SessionReadiness | null
  /** The person's choice, else the app's proposal from the session's date (spec 037). */
  readonly protocolVersion: number | null
  readonly video: {
    readonly fileId: string
    readonly name: string
    readonly modifiedAt: string | null
    readonly size: number | null
    readonly durationMs: number | null
  } | null
  /** The accepted participant; on an anonymised study their pseudonym (`P01`…). */
  readonly participant: string | null
  /** The accepted facilitators; on an anonymised study their labels (`I01`…). */
  readonly facilitators: readonly string[]
  /** An accepted participant exists. */
  readonly hasPeople: boolean
}

export type UsabilityAccess =
  | {
      readonly kind: 'full'
      readonly type: string
      readonly anonymised: boolean
      readonly teamId: string
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'folder-required' }

export type UsabilitySources = {
  access(accountId: string, studyId: string): Promise<UsabilityAccess>
  /** The test sessions of a usability test study; empty for other types or without access. */
  sessions(accountId: string, studyId: string): Promise<UsabilitySession[]>
  session(accountId: string, sessionId: string): Promise<UsabilitySession | null>
  /**
   * The study and video file of a session, from its row alone: the player asks for it at every
   * range, so it never builds the study's sessions (access is checked by `videoRange`).
   */
  sessionVideo(sessionId: string): Promise<{ studyId: string; fileId: string } | null>
  /** The video's bytes to a local path, with the person's own Drive access. */
  downloadVideo(
    accountId: string,
    studyId: string,
    fileId: string,
    toPath: string,
  ): Promise<{ bytes: number } | 'not-found' | 'access-lost'>
  /** A byte range of the video for the player, with the person's own Drive access. */
  videoRange(
    accountId: string,
    studyId: string,
    fileId: string,
    range: string | null,
  ): Promise<Awaited<ReturnType<DriveGateway['videoRange']>> | 'access-lost'>
  /** Spec 022: the person agreed that this study's files go to this provider. */
  hasConsent(accountId: string, studyId: string, provider: string): Promise<boolean>
  giveConsent(accountId: string, studyId: string, provider: string): Promise<void>
  /**
   * The names the app knows for the study: its rosters, and with `accountId` its team members.
   * They are never added to a prompt on an anonymised study.
   */
  knownNames(studyId: string, accountId?: string): Promise<string[]>
  /** Spec 038 FR-013: people proposed from the analysis's transcript (spec 009 rules, then AI). */
  proposePeopleFromText(accountId: string, sessionId: string, text: string): Promise<void>
}

/** Spec 038: what the Usability analysis module reads and asks of Ingestion. */
export const makeUsabilitySources = (
  deps: IngestionDeps,
  queries: SessionQueries,
  analysis: AnalysisCommands,
): UsabilitySources => {
  const actorOf = async (accountId: string, studyId: string) => {
    const visible = await deps.studies.getStudyAccess(accountId, studyId)
    return visible ? { id: accountId, role: visible.role } : null
  }

  const access = async (accountId: string, studyId: string): Promise<UsabilityAccess> => {
    const a = await resolveStudyAccess(deps, accountId, studyId)
    if (a.kind === 'not-found') return { kind: 'not-found' }
    if (a.kind !== 'full') return { kind: 'folder-required' }
    return { kind: 'full', type: a.type, anonymised: a.anonymised, teamId: a.teamId }
  }

  /** Codes of the people on an anonymised study (spec 011: P.. and I.., given once per study). */
  const codesOf = async (studyId: string, views: readonly SessionView[]) => {
    const keyOf = (role: 'interviewer' | 'interviewee', name: string) =>
      role === 'interviewer' ? `interviewer:${nameKey(name)}` : nameKey(name)
    const needed = (role: 'interviewer' | 'interviewee') =>
      views.flatMap((v) =>
        v.roster
          .filter((r) => r.role === role)
          .map((r) => ({ key: keyOf(role, r.name), date: v.interviewDate })),
      )
    const now = deps.clock.now()
    const p = await deps.store.ensurePseudonyms(studyId, needed('interviewee'), now)
    const i = await deps.store.ensurePseudonyms(studyId, needed('interviewer'), now, 'I')
    return (role: 'interviewer' | 'interviewee', name: string) =>
      (role === 'interviewer' ? i : p).get(keyOf(role, name)) ?? null
  }

  const toSession = (
    studyId: string,
    v: SessionView,
    files: ReadonlyMap<string, { size: number | null }>,
    code: ((role: 'interviewer' | 'interviewee', name: string) => string | null) | null,
  ): UsabilitySession => {
    const named = (role: 'interviewer' | 'interviewee') =>
      v.roster
        .filter((r) => r.role === role)
        .map((r) => (code ? (code(role, r.name) ?? '') : r.name))
    const participant = named('interviewee')[0] ?? null
    return {
      sessionId: v.id,
      studyId,
      title: v.title ?? v.defaultTitle,
      state: v.state,
      readiness: v.readiness,
      protocolVersion: v.protocolVersion?.version ?? null,
      video: v.video
        ? {
            fileId: v.video.fileId,
            name: v.video.name,
            modifiedAt: v.video.modifiedAt,
            size: files.get(v.video.fileId)?.size ?? null,
            durationMs: v.video.durationMs,
          }
        : null,
      participant: participant || null,
      facilitators: named('interviewer').filter((n) => n.length > 0),
      hasPeople: v.roster.some((r) => r.role === 'interviewee'),
    }
  }

  const sessions = async (accountId: string, studyId: string): Promise<UsabilitySession[]> => {
    const actor = await actorOf(accountId, studyId)
    if (!actor) return []
    const a = await access(accountId, studyId)
    if (a.kind !== 'full' || a.type !== 'usability-test') return []
    const view = await queries.fieldwork(actor, studyId)
    if (!view.ok) return []
    const files = new Map(
      (await deps.store.listFiles(studyId, { kind: 'media' })).map((f) => [f.id, f]),
    )
    const code = a.anonymised ? await codesOf(studyId, view.value.sessions) : null
    return view.value.sessions.map((v) => toSession(studyId, v, files, code))
  }

  const tokenOf = async (accountId: string) =>
    deps.drive ? await readRefreshToken(deps, await deps.store.getConnection(accountId)) : null

  /** The file must be a video of the study's inventory, opened with the person's own access. */
  const videoOfStudy = async (accountId: string, studyId: string, fileId: string) => {
    const a = await access(accountId, studyId)
    if (a.kind !== 'full') return null
    const [file] = (await deps.store.listFiles(studyId, { kind: 'media' })).filter(
      (f) => f.id === fileId && f.mimeType.startsWith('video/'),
    )
    return file ?? null
  }

  return {
    access,
    sessions,

    session: async (accountId, sessionId) => {
      const s = await deps.store.getSession(sessionId)
      if (!s) return null
      return (await sessions(accountId, s.studyId)).find((x) => x.sessionId === sessionId) ?? null
    },

    sessionVideo: async (sessionId) => {
      const s = await deps.store.getSession(sessionId)
      return s?.videoFileId ? { studyId: s.studyId, fileId: s.videoFileId } : null
    },

    downloadVideo: async (accountId, studyId, fileId, toPath) => {
      if (!(await videoOfStudy(accountId, studyId, fileId))) return 'not-found'
      const token = await tokenOf(accountId)
      if (!deps.drive || !token) return 'access-lost'
      try {
        return (await deps.drive.gateway.downloadFile(token, fileId, toPath)) ?? 'not-found'
      } catch (error) {
        if (error instanceof DriveConnectionLost) {
          await deps.store.markConnectionLost(accountId, error.reason)
          return 'access-lost'
        }
        throw error
      }
    },

    videoRange: async (accountId, studyId, fileId, range) => {
      if (!(await videoOfStudy(accountId, studyId, fileId))) return null
      const token = await tokenOf(accountId)
      if (!deps.drive || !token) return 'access-lost'
      try {
        return await deps.drive.gateway.videoRange(token, fileId, range)
      } catch (error) {
        if (error instanceof DriveConnectionLost) {
          await deps.store.markConnectionLost(accountId, error.reason)
          return 'access-lost'
        }
        throw error
      }
    },

    hasConsent: (accountId, studyId, provider) =>
      deps.store.hasConsent(accountId, studyId, provider),
    giveConsent: (accountId, studyId, provider) =>
      deps.store.saveConsent(accountId, studyId, provider, deps.clock.now()),

    knownNames: async (studyId, accountId) => {
      const rosters = (await deps.store.listSessions(studyId)).flatMap((s) =>
        s.roster.map((r) => r.name),
      )
      const visible = accountId ? await deps.studies.getStudyAccess(accountId, studyId) : null
      const members = visible ? await deps.members.ofTeam(visible.teamId) : []
      return [...new Set([...rosters, ...members.map((m) => m.name)])].filter(
        (n) => n.trim().length > 0,
      )
    },

    proposePeopleFromText: async (accountId, sessionId, text) => {
      const s = await deps.store.getSession(sessionId)
      if (!s) return
      const actor = await actorOf(accountId, s.studyId)
      if (actor) await analysis.proposePeopleFromText(actor, sessionId, text)
    },
  }
}
