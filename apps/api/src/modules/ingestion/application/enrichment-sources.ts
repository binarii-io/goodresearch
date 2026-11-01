import { err, ok, type Result } from '@goodresearch/shared'
import { DriveConnectionLost, TranscriptUnreadable } from '../domain/drive-gateway.ts'
import { nameKey } from '../domain/pseudonyms.ts'
import { splitNames } from '../domain/session.ts'
import { resolveStudyAccess } from './access.ts'
import { readRefreshToken } from './connection.ts'
import type { IngestionDeps } from './ports.ts'

/** Spec 010 FR-004: the longest transcript imported (about six hours of speech). */
export const TRANSCRIPT_MAX_CHARS = 400_000
const READ_ATTEMPTS = 2

export type EnrichmentSession = {
  readonly id: string
  readonly title: string
  readonly interviewDate: string | null
  readonly language: 'en' | 'fr' | 'other' | null
  readonly transcript: {
    readonly fileId: string
    readonly name: string
    readonly mimeType: string
    readonly modifiedAt: string | null
  } | null
}

export type TranscriptFailure =
  | 'FILE_NOT_FOUND'
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_UNAVAILABLE'
  | 'UNREADABLE_FORMAT'
  | 'TOO_LONG'
  | 'NO_TRANSCRIPT'

/**
 * Spec 010: what the Enrichment phase reads from the interviews, with one person's own access —
 * the validated sessions, the full text of a transcript, and the names the app knows (they never
 * go to an AI provider).
 */
export const makeEnrichmentSources = (deps: IngestionDeps) => {
  const visible = async (accountId: string, studyId: string) => {
    const access = await resolveStudyAccess(deps, accountId, studyId)
    return access.kind === 'full' && access.type === 'interviews' ? access : null
  }

  return {
    /** The validated sessions, and the count of the others still to decide; null without access. */
    enrichmentSessions: async (
      accountId: string,
      studyId: string,
    ): Promise<{ sessions: EnrichmentSession[]; toValidate: number } | null> => {
      if (!(await visible(accountId, studyId))) return null
      const [sessions, files] = await Promise.all([
        deps.store.sessionSummaries(studyId),
        deps.store.listFiles(studyId, {}),
      ])
      const byId = new Map(files.map((f) => [f.id, f]))
      const validated = sessions.filter((s) => s.state === 'validated')
      return {
        toValidate: sessions.filter((s) => s.state === 'proposed').length,
        sessions: validated.map((s) => {
          const file = s.transcriptFileId ? byId.get(s.transcriptFileId) : undefined
          return {
            id: s.id,
            title: s.title ?? file?.name ?? s.id,
            interviewDate: s.interviewDate,
            language: s.language,
            transcript:
              s.transcriptFileId && file
                ? {
                    fileId: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    modifiedAt: file.modifiedAt,
                  }
                : null,
          }
        }),
      }
    },

    /** The full text of a validated session's transcript (FR-004), read in Drive once more on a network error. */
    readTranscript: async (
      accountId: string,
      studyId: string,
      sessionId: string,
    ): Promise<Result<{ text: string; modifiedAt: string | null }, TranscriptFailure>> => {
      if (!(await visible(accountId, studyId))) return err('FILE_NOT_FOUND')
      const session = await deps.store.getSession(sessionId)
      if (!session || session.studyId !== studyId || session.state !== 'validated')
        return err('FILE_NOT_FOUND')
      if (!session.transcriptFileId) return err('NO_TRANSCRIPT')
      const [file] = (await deps.store.listFiles(studyId, {})).filter(
        (f) => f.id === session.transcriptFileId,
      )
      if (!file) return err('FILE_NOT_FOUND')
      const token = deps.drive
        ? await readRefreshToken(deps, await deps.store.getConnection(accountId))
        : null
      if (!deps.drive || !token) return err('DRIVE_NOT_CONNECTED')
      for (let attempt = 1; ; attempt++) {
        try {
          const text = await deps.drive.gateway.readTextStart(token, file, TRANSCRIPT_MAX_CHARS)
          if (text === null) return err('FILE_NOT_FOUND')
          if (Array.from(text).length >= TRANSCRIPT_MAX_CHARS) return err('TOO_LONG')
          return ok({ text, modifiedAt: file.modifiedAt })
        } catch (error) {
          if (error instanceof TranscriptUnreadable) return err('UNREADABLE_FORMAT')
          if (error instanceof DriveConnectionLost) return err('DRIVE_NOT_CONNECTED')
          if (attempt >= READ_ATTEMPTS) {
            deps.log.warn(
              { err: error instanceof Error ? error.message : 'unknown', fileId: file.id },
              'transcript not imported: Drive unavailable',
            )
            return err('DRIVE_UNAVAILABLE')
          }
        }
      }
    },

    /**
     * Spec 011 research R5: the people of the study's validated interviews with their codes —
     * interviewees their pseudonym (`P01`…), interviewers their own code (`I01`…), both numbered
     * once per study in the order of interview dates. Codes are given only with `assign` (a
     * cleaning run, a validation); reads see those given already. With `uncoded`, a person without
     * a code yet stays, with an empty code: who speaks must not depend on a run having happened
     * (spec 016: dropped, an interviewer's label fell to the interviewee, a false 0%). Null without
     * access.
     */
    cleaningNames: async (
      accountId: string,
      studyId: string,
      options: { assign: boolean; uncoded?: boolean },
    ): Promise<{
      anonymised: boolean
      people: Record<string, { name: string; role: 'interviewer' | 'interviewee'; code: string }[]>
    } | null> => {
      const access = await visible(accountId, studyId)
      if (!access) return null
      const sessions = await deps.store.listSessions(studyId)
      const keyOf = (role: 'interviewer' | 'interviewee', name: string) =>
        role === 'interviewer' ? `interviewer:${nameKey(name)}` : nameKey(name)
      const needed = (role: 'interviewer' | 'interviewee') =>
        options.assign
          ? sessions.flatMap((s) =>
              s.roster
                .filter((r) => r.role === role)
                .map((r) => ({ key: keyOf(role, r.name), date: s.interviewDate })),
            )
          : []
      const now = deps.clock.now()
      // Nothing needed: a read of the codes given already.
      const interviewees = await deps.store.ensurePseudonyms(studyId, needed('interviewee'), now)
      const interviewers = await deps.store.ensurePseudonyms(
        studyId,
        needed('interviewer'),
        now,
        'I',
      )
      const people: Record<
        string,
        { name: string; role: 'interviewer' | 'interviewee'; code: string }[]
      > = {}
      for (const s of sessions.filter((x) => x.state === 'validated'))
        people[s.id] = s.roster.flatMap((r) => {
          const code = (r.role === 'interviewer' ? interviewers : interviewees).get(
            keyOf(r.role, r.name),
          )
          if (code) return [{ name: r.name, role: r.role, code }]
          return options.uncoded ? [{ name: r.name, role: r.role, code: '' }] : []
        })
      return { anonymised: access.anonymised, people }
    },

    /** The names of the study's rosters, schedule and team members; empty without access. */
    knownNames: async (accountId: string, studyId: string): Promise<string[]> => {
      const access = await visible(accountId, studyId)
      if (!access) return []
      const [sessions, schedule, members] = await Promise.all([
        deps.store.listSessions(studyId),
        deps.schedule.list(accountId, studyId),
        deps.members.ofTeam(access.teamId),
      ])
      return [
        ...new Set([
          ...sessions.flatMap((s) => s.roster.map((r) => r.name)),
          ...(schedule ?? []).flatMap((p) => [p.interviewee, ...splitNames(p.interviewers)]),
          ...members.map((m) => m.name),
        ]),
      ].filter((n) => n.trim().length > 0)
    },
  }
}
