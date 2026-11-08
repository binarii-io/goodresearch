import { err, ok, type Result } from '@goodresearch/shared'
import {
  decideObservation,
  givesFact,
  type Observation,
  type ObservationAction,
  type ObservationKind,
  polarityOf,
  TEXT_MAX,
} from '../../domain/observation.ts'
import { correctTaskResult, type Outcome, type TaskResult } from '../../domain/task-result.ts'
import type { Actor, UsabilityDeps } from '../ports.ts'

export type ObservationFailure =
  | 'OBSERVATION_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'VERSION_CONFLICT'
  | 'VALIDATION'
  | 'INVALID_TRANSITION'
  | 'NAME_IN_STATEMENT'

/** Spec 038 US2: people decide the observations; decided ones give facts (FR-022). */
export const makeObservationCommands = (deps: UsabilityDeps) => {
  /** The analysis, its session and protocol, if the person can act on the study. */
  const context = async (actor: Actor, analysisId: string) => {
    const analysis = await deps.store.analysisById(analysisId)
    if (!analysis) return err('SESSION_NOT_FOUND' as const)
    const access = await deps.sessions.access(actor.id, analysis.studyId)
    if (access.kind === 'not-found') return err('SESSION_NOT_FOUND' as const)
    if (access.kind === 'folder-required') return err('FOLDER_ACCESS_REQUIRED' as const)
    const [session, protocol] = await Promise.all([
      deps.sessions.one(actor.id, analysis.sessionId),
      deps.protocols.version(analysis.studyId, analysis.protocolVersion),
    ])
    if (!session || !protocol) return err('SESSION_NOT_FOUND' as const)
    return ok({ analysis, session, protocol })
  }

  type Ctx = Extract<Awaited<ReturnType<typeof context>>, { ok: true }>['value']

  /** The fact follows the observation: made when decided, withdrawn otherwise. */
  const syncFact = async (
    actor: Actor,
    ctx: Ctx,
    o: Observation,
  ): Promise<Result<unknown, 'VALIDATION' | 'NAME_IN_STATEMENT'>> => {
    const task = ctx.protocol.tasks.find((t) => t.id === o.taskId)
    if (!givesFact(o) || !task) {
      await deps.facts.withdraw(o.id)
      return ok(undefined)
    }
    return deps.facts.upsert({
      accountId: actor.id,
      observationId: o.id,
      studyId: ctx.analysis.studyId,
      sessionId: ctx.analysis.sessionId,
      statement: o.text,
      language: ctx.protocol.language,
      polarity: polarityOf(o.kind),
      theme: { id: task.id, title: task.instruction },
      quote: o.quote,
      momentMs: o.momentMs,
      screenshotKey: o.screenshotKey,
      participant: ctx.session.participant,
      origin: o.status === 'edited' || o.origin === 'person' ? 'person' : 'ai',
    })
  }

  return {
    decide: async (c: {
      actor: Actor
      observationId: string
      decision: ObservationAction
      version: number
    }): Promise<Result<Observation, ObservationFailure>> => {
      const o = await deps.store.observation(c.observationId)
      if (!o) return err('OBSERVATION_NOT_FOUND')
      const ctx = await context(c.actor, o.analysisId)
      if (!ctx.ok) return ctx
      if (o.version !== c.version) return err('VERSION_CONFLICT')
      const moved = c.decision.action === 'edit' ? c.decision.value.taskId : undefined
      // An observation always belongs to a task of the protocol: one without would show nowhere.
      if (moved === null) return err('VALIDATION')
      if (moved && !ctx.value.protocol.tasks.some((t) => t.id === moved)) return err('VALIDATION')
      const next = decideObservation(o, c.decision, c.actor.id, deps.clock.now())
      if (!next.ok) return next
      // The fact first: a statement it refuses (a person's name) leaves the observation as it was.
      const fact = await syncFact(c.actor, ctx.value, next.value)
      if (!fact.ok) return fact
      if ((await deps.store.saveObservation(next.value, c.version)) === 'stale') {
        // Someone decided meanwhile: the fact follows what was saved, not this attempt.
        const saved = await deps.store.observation(o.id)
        if (saved) await syncFact(c.actor, ctx.value, saved)
        return err('VERSION_CONFLICT')
      }
      return ok({ ...next.value, version: c.version + 1 })
    },

    /** A person adds what the analysis missed: accepted at once, origin person. */
    add: async (c: {
      actor: Actor
      sessionId: string
      kind: Exclude<ObservationKind, 'sus-answer'>
      taskId: string
      momentMs: number
      text: string
    }): Promise<Result<Observation, ObservationFailure>> => {
      const analysis = await deps.store.analysisOf(c.sessionId)
      if (!analysis || analysis.state !== 'done') return err('SESSION_NOT_FOUND')
      const ctx = await context(c.actor, analysis.id)
      if (!ctx.ok) return ctx
      const text = c.text.trim()
      if (
        text.length < 1 ||
        text.length > TEXT_MAX ||
        !Number.isInteger(c.momentMs) ||
        c.momentMs < 0 ||
        !ctx.value.protocol.tasks.some((t) => t.id === c.taskId)
      )
        return err('VALIDATION')
      const now = deps.clock.now()
      const o: Observation = {
        id: deps.newId(),
        analysisId: analysis.id,
        taskId: c.taskId,
        kind: c.kind,
        momentMs: c.momentMs,
        text,
        quote: null,
        seen: null,
        susItem: null,
        susValue: null,
        screenshotKey: null,
        judge: null,
        judgeReason: null,
        arbiter: null,
        arbiterReason: null,
        origin: 'person',
        status: 'accepted',
        decidedBy: c.actor.id,
        decidedAt: now,
        version: 1,
      }
      const fact = await syncFact(c.actor, ctx.value, o)
      if (!fact.ok) return fact
      await deps.store.addObservation(o)
      return ok(o)
    },

    correctTask: async (c: {
      actor: Actor
      taskResultId: string
      outcome: Outcome
      timeOnTaskMs?: number | null | undefined
      version: number
    }): Promise<Result<TaskResult, ObservationFailure>> => {
      const r = await deps.store.taskResult(c.taskResultId)
      if (!r) return err('OBSERVATION_NOT_FOUND')
      const ctx = await context(c.actor, r.analysisId)
      if (!ctx.ok) return ctx
      if (r.version !== c.version) return err('VERSION_CONFLICT')
      const next = correctTaskResult(r, c, c.actor.id, deps.clock.now())
      if (!next.ok) return next
      if ((await deps.store.saveTaskResult(next.value, c.version)) === 'stale')
        return err('VERSION_CONFLICT')
      return ok({ ...next.value, version: c.version + 1 })
    },
  }
}

export type ObservationCommands = ReturnType<typeof makeObservationCommands>
