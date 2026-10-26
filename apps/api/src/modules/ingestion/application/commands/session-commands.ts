import { err, newId, ok, type Result } from '@goodresearch/shared'
import {
  type Decision,
  decide,
  edit,
  givesUpRecordings,
  link,
  personDecided,
  prefillRoster,
  type RosterInput,
  rosterOf,
  type Session,
} from '../../domain/session.ts'
import { resolveStudyAccess } from '../access.ts'
import type { Actor, IngestionDeps, PlannedSummary } from '../ports.ts'
import { makePlannedSync } from './planned-sync.ts'

type Failure =
  | 'SESSION_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'
  | 'SESSION_DECIDED'
  | 'INVALID_TRANSITION'
  | 'MEDIA_UNAVAILABLE'
  | 'MEMBER_NOT_FOUND'
  | 'PLANNED_INTERVIEW_NOT_FOUND'
  | 'PLANNED_INTERVIEW_LINKED'
  | 'LINKED_TO_DECIDED_SESSION'
  | 'NOT_AN_INTERVIEW_STUDY'

type Done = Result<{ id: string }, Failure>

/**
 * Spec 008 US2/US3: people link, edit and decide the sessions the app proposed. Each command checks
 * the version the person saw; a link to a planned interview no longer in the schedule is dropped
 * on the next write (research R6).
 */
export const makeSessionCommands = (deps: IngestionDeps) => {
  const sync = makePlannedSync(deps)
  /** The session, if the person can act on its study, at the version they saw. */
  const load = async (
    actor: Actor,
    sessionId: string,
    version: number,
  ): Promise<Result<{ session: Session; schedule: readonly PlannedSummary[] | null }, Failure>> => {
    const session = await deps.store.getSession(sessionId)
    if (!session) return err('SESSION_NOT_FOUND')
    const access = await resolveStudyAccess(deps, actor.id, session.studyId)
    if (access.kind === 'not-found') return err('SESSION_NOT_FOUND')
    if (access.kind !== 'full') return err('FOLDER_ACCESS_REQUIRED')
    if (access.type !== 'interviews') return err('NOT_AN_INTERVIEW_STUDY')
    if (session.version !== version) return err('VERSION_CONFLICT')
    const schedule = await deps.schedule.list(actor.id, session.studyId)
    // Only a schedule actually read can show that the planned interview is gone.
    const dangling =
      schedule !== null &&
      session.plannedInterviewId !== null &&
      !schedule.some((p) => p.id === session.plannedInterviewId)
    return ok({
      session: dangling ? { ...session, plannedInterviewId: null, linkedBy: null } : session,
      schedule,
    })
  }

  const save = async (
    next: Session,
    expected: number,
    release: readonly string[] = [],
  ): Promise<Done> => {
    const written = await deps.store.saveSession(next, expected, release)
    if (written === 'stale') return err('VERSION_CONFLICT')
    if (written === 'linked') return err('PLANNED_INTERVIEW_LINKED')
    if (written === 'media-taken') return err('MEDIA_UNAVAILABLE')
    return ok({ id: next.id })
  }

  return {
    link: async (c: {
      actor: Actor
      sessionId: string
      plannedInterviewId: string | null
      version: number
      move?: boolean | undefined
      confirmSuggestion?: boolean | undefined
    }): Promise<Done> => {
      const loaded = await load(c.actor, c.sessionId, c.version)
      if (!loaded.ok) return loaded
      const { session, schedule } = loaded.value
      const planned = c.plannedInterviewId
        ? schedule?.find((p) => p.id === c.plannedInterviewId)
        : null
      if (c.plannedInterviewId && !planned) return err('PLANNED_INTERVIEW_NOT_FOUND')
      const now = deps.clock.now()
      const linked = link(
        session,
        c.plannedInterviewId,
        c.confirmSuggestion ? 'suggestion' : 'person',
        now,
      )
      if (!linked.ok) return linked
      const next: Session =
        planned && session.roster.length === 0
          ? { ...linked.value, roster: prefillRoster(planned, newId) }
          : linked.value
      if (!c.plannedInterviewId) return save(next, c.version)

      const holder = (await deps.store.listSessions(session.studyId)).find(
        (s) => s.id !== session.id && s.plannedInterviewId === c.plannedInterviewId,
      )
      if (!holder) return save(next, c.version)
      if (!c.move)
        return err('PLANNED_INTERVIEW_LINKED', {
          sessionId: holder.id,
          title: holder.title ?? planned?.interviewee ?? null,
        })
      // The other interview is decided: it must be reopened first (not this one).
      if (personDecided(holder)) return err('LINKED_TO_DECIDED_SESSION')
      const moved = await deps.store.moveLink(
        { ...holder, plannedInterviewId: null, linkedBy: null, updatedAt: now },
        next,
        { from: holder.version, to: c.version },
      )
      if (moved === 'saved') return ok({ id: next.id })
      if (moved === 'linked') return err('PLANNED_INTERVIEW_LINKED')
      return err(moved === 'media-taken' ? 'MEDIA_UNAVAILABLE' : 'VERSION_CONFLICT')
    },

    edit: async (c: {
      actor: Actor
      sessionId: string
      version: number
      title?: string | null | undefined
      media?: readonly string[] | undefined
      roster?: readonly RosterInput[] | undefined
    }): Promise<Done> => {
      const loaded = await load(c.actor, c.sessionId, c.version)
      if (!loaded.ok) return loaded
      const { session } = loaded.value
      let roster: Session['roster'] | undefined
      if (c.roster) {
        const built = rosterOf(c.roster, session.roster, newId)
        if (!built.ok) return built
        const members = built.value.flatMap((r) => (r.memberId ? [r.memberId] : []))
        if (members.length && !(await deps.members.exist(members))) return err('MEMBER_NOT_FOUND')
        roster = built.value
      }
      // A recording belongs to one session at most (FR-004).
      const [files, sessions] = await Promise.all([
        deps.store.listFiles(session.studyId, { kind: 'media' }),
        deps.store.listSessions(session.studyId),
      ])
      // A row without transcript gives its recording to this interview, and goes once empty.
      const others = sessions.filter((s) => s.id !== session.id)
      const elsewhere = new Set(
        others.filter((s) => !givesUpRecordings(s)).flatMap((s) => s.media.map((m) => m.fileId)),
      )
      const available = new Set(files.filter((f) => !elsewhere.has(f.id)).map((f) => f.id))
      const chosen = new Set(c.media ?? [])
      const release = others
        .filter((s) => givesUpRecordings(s) && s.media.some((m) => chosen.has(m.fileId)))
        .map((s) => s.id)
      const next = edit(
        session,
        { title: c.title, media: c.media, roster },
        available,
        deps.clock.now(),
      )
      if (!next.ok) return next
      const saved = await save(next.value, c.version, release)
      // The schedule follows the people of its interview (spec 009 FR-022).
      if (saved.ok && roster) await sync.push(c.actor, next.value)
      return saved
    },

    decide: async (c: {
      actor: Actor
      sessionId: string
      decision: Decision
      reason?: string | undefined
      version: number
    }): Promise<Done> => {
      const loaded = await load(c.actor, c.sessionId, c.version)
      if (!loaded.ok) return loaded
      const next = decide(loaded.value.session, c.decision, c.actor.id, deps.clock.now(), c.reason)
      if (!next.ok) return next
      return save(next.value, c.version)
    },
  }
}

export type SessionCommands = ReturnType<typeof makeSessionCommands>
