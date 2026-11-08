import { givesFact, type Observation, polarityOf } from '../domain/observation.ts'
import { studyResults } from '../domain/results.ts'
import type { ProtocolOfSession, SessionRef, UsabilityDeps } from './ports.ts'

/** What Evidence keeps of an observation as its fact, with the observation's status. */
export const observationFactInput = (
  accountId: string,
  ctx: {
    studyId: string
    sessionId: string
    session: Pick<SessionRef, 'participant'>
    protocol: Pick<ProtocolOfSession, 'language' | 'tasks'>
  },
  o: Observation,
) => {
  const task = ctx.protocol.tasks.find((t) => t.id === o.taskId)
  if (!task || !givesFact(o)) return null
  return {
    accountId,
    observationId: o.id,
    studyId: ctx.studyId,
    sessionId: ctx.sessionId,
    statement: o.text,
    language: ctx.protocol.language,
    polarity: polarityOf(o.kind),
    theme: { id: task.id, title: task.instruction },
    quote: o.quote,
    momentMs: o.momentMs,
    screenshotKey: o.screenshotKey,
    participant: ctx.session.participant,
    origin: o.status === 'edited' || o.origin === 'person' ? ('person' as const) : ('ai' as const),
    status: o.status,
    decidedBy: o.decidedBy,
    decidedAt: o.decidedAt,
  }
}

/**
 * The tasks of a study's analysed sessions, in the order of the latest protocol version, then those
 * only in older ones; with each analysis's version of the protocol.
 */
export const studyTasks = async (deps: UsabilityDeps, studyId: string) => {
  const analyses = await deps.store.analysesOf(studyId)
  const versions = new Map<number, ProtocolOfSession | null>()
  for (const v of new Set(analyses.map((a) => a.protocolVersion)))
    versions.set(v, await deps.protocols.version(studyId, v))
  const ordered = [...versions.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, p]) => p?.tasks ?? [])
  const seen = new Set<string>()
  const taskList = ordered.filter((t) => !seen.has(t.id) && seen.add(t.id))
  return { analyses, versions, taskList }
}

/** Spec 039 FR-008a: the task facts of a study, from the decided outcomes of its sessions. */
export const syncTaskFacts = async (deps: UsabilityDeps, studyId: string) => {
  const { analyses, versions, taskList } = await studyTasks(deps, studyId)
  const results = await deps.store.taskResultsOf(analyses.map((a) => a.id))
  const computed = studyResults(
    taskList.map((t) => t.id),
    analyses.map((a) => ({
      sessionId: a.sessionId,
      taskIds: versions.get(a.protocolVersion)?.tasks.map((t) => t.id) ?? [],
      tasks: results.filter((r) => r.analysisId === a.id),
      observations: [],
    })),
  )
  await deps.facts.syncTasks(
    studyId,
    computed.tasks.map((t) => {
      const index = taskList.findIndex((x) => x.id === t.taskId)
      return {
        studyId,
        task: { id: t.taskId, index: index + 1, instruction: taskList[index]?.instruction ?? '' },
        outcomes: {
          success: t.outcomes.success,
          partial: t.outcomes.partial,
          failure: t.outcomes.failure,
          notAttempted: t.outcomes['not-attempted'],
        },
      }
    }),
  )
}
