import { newId } from '@goodresearch/shared'
import {
  type PlannedShared,
  scheduleChange,
  sessionFromPlanned,
} from '../../domain/planned-sync.ts'
import type { Session } from '../../domain/session.ts'
import type { Actor, IngestionDeps } from '../ports.ts'

const ATTEMPTS = 2

/**
 * Spec 009 FR-022: an interview and its planned interview share who and when. A change on one
 * side is written on the other; each side compares first, so the two never loop.
 */
export const makePlannedSync = (deps: IngestionDeps) => ({
  /** After a person changed an interview: its planned interview takes the same values. */
  push: async (actor: Actor, s: Session): Promise<void> => {
    if (!s.plannedInterviewId) return
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const planned = (await deps.schedule.list(actor.id, s.studyId))?.find(
        (p) => p.id === s.plannedInterviewId,
      )
      if (!planned) return
      const change = scheduleChange(s, planned)
      if (!change) return
      if (await deps.schedule.update(actor, s.studyId, planned.id, change)) return
    }
    deps.log.warn({ sessionId: s.id }, 'schedule not updated from its interview')
  },

  /** After a planned interview changed: its interview takes the same values (unless decided). */
  plannedChanged: async (
    _actor: Actor,
    planned: PlannedShared & { readonly studyId: string },
  ): Promise<void> => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const s = (await deps.store.listSessions(planned.studyId)).find(
        (x) => x.plannedInterviewId === planned.id,
      )
      if (!s) return
      const next = sessionFromPlanned(s, planned, newId, deps.clock.now())
      if (!next) return
      if ((await deps.store.saveSession(next, s.version)) === 'saved') return
    }
    deps.log.warn({ plannedInterviewId: planned.id }, 'interview not updated from its schedule')
  },
})
