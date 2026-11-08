import { err, ok } from '@goodresearch/shared'
import { outOfDate, usabilityRef } from '../../domain/analysis.ts'
import { minutesOf } from '../../domain/estimate.ts'
import { checksRejected } from '../../domain/observation.ts'
import { studyResults } from '../../domain/results.ts'
import { isLive, type makeAnalysisRun } from '../commands/analysis-run.ts'
import type { Actor, UsabilityDeps } from '../ports.ts'

/** Spec 038: what the Analysis tab and the session review show; only what is displayed is read. */
export const makeAnalysisQueries = (
  deps: UsabilityDeps,
  run: ReturnType<typeof makeAnalysisRun>,
) => {
  const gate = async (actor: Actor, studyId: string) => {
    const access = await deps.sessions.access(actor.id, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND' as const)
    if (access.kind === 'folder-required') return err('FOLDER_ACCESS_REQUIRED' as const)
    if (access.type !== 'usability-test') return err('NOT_A_USABILITY_TEST_STUDY' as const)
    return ok(access)
  }

  return {
    study: async (actor: Actor, studyId: string) => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return allowed
      const [sessions, analyses, last, estimate] = await Promise.all([
        deps.sessions.list(actor.id, studyId),
        deps.store.analysesOf(studyId),
        deps.store.lastRun(studyId),
        run.estimate(actor, studyId),
      ])
      const byId = new Map(analyses.map((a) => [a.sessionId, a]))
      // Counted by the database: the rows themselves are not shown here.
      const toReview = await deps.store.toReviewCounts(analyses.map((a) => a.id))
      const costs = await run.costs(
        sessions.map((s) => s.sessionId),
        studyId,
      )
      const live = isLive(last, deps.clock.now()) ? last : null
      return ok({
        sessions: sessions
          .filter((s) => s.state !== 'excluded')
          .map((s) => {
            const a = byId.get(s.sessionId)
            return {
              sessionId: s.sessionId,
              title: s.title,
              participant: s.participant,
              videoMinutes: s.video?.durationMs ? Math.round(s.video.durationMs / 60_000) : null,
              readiness: s.readiness,
              // FR-001: the estimate of analysing this session alone, shown before its own analysis.
              estimate:
                estimate.ok && estimate.value.perMinute !== null
                  ? minutesOf(s.video?.durationMs ?? 60_000) * estimate.value.perMinute
                  : null,
              analysis: a
                ? {
                    state: a.state,
                    stage: a.stage,
                    failure: a.failure,
                    outOfDate:
                      a.state === 'done' &&
                      outOfDate(a, { protocolVersion: s.protocolVersion, video: s.video }),
                    cost: costs.bySession.get(usabilityRef(s.sessionId)) ?? null,
                    toReview: toReview.get(a.id) ?? 0,
                  }
                : null,
            }
          }),
        run: live
          ? { id: live.id, stopRequested: live.stopRequested, total: live.sessionIds.length }
          : null,
        estimate: estimate.ok
          ? {
              count: estimate.value.count,
              minutes: estimate.value.minutes,
              cost: estimate.value.cost,
            }
          : { count: 0, minutes: 0, cost: 0 },
        consentNeeded: estimate.ok ? estimate.value.consentNeeded : false,
        provider: {
          kind: estimate.ok ? estimate.value.provider : null,
          video: estimate.ok ? estimate.value.readsVideo : false,
        },
        cost: costs.total,
      })
    },

    session: async (actor: Actor, sessionId: string) => {
      const session = await deps.sessions.one(actor.id, sessionId)
      if (!session) return err('SESSION_NOT_FOUND' as const)
      const allowed = await gate(actor, session.studyId)
      if (!allowed.ok)
        return allowed.error === 'STUDY_NOT_FOUND' ? err('SESSION_NOT_FOUND' as const) : allowed
      const analysis = await deps.store.analysisOf(sessionId)
      if (!analysis) return err('SESSION_NOT_FOUND' as const)
      const [protocol, transcript, results, observations, costs] = await Promise.all([
        deps.protocols.version(session.studyId, analysis.protocolVersion),
        deps.store.transcriptOf(analysis.id),
        deps.store.taskResultsOf([analysis.id]),
        deps.store.observationsOf([analysis.id]),
        deps.ai.costs([usabilityRef(sessionId)]),
      ])
      const shown = observations.filter((o) => !(checksRejected(o) && o.status === 'proposed'))
      return ok({
        session: {
          id: session.sessionId,
          title: session.title,
          participant: session.participant,
          facilitators: [...session.facilitators],
        },
        analysis: { state: analysis.state, stage: analysis.stage, failure: analysis.failure },
        protocolVersion: analysis.protocolVersion,
        outOfDate: outOfDate(analysis, {
          protocolVersion: session.protocolVersion,
          video: session.video,
        }),
        tasks: (protocol?.tasks ?? []).map((t) => ({
          taskId: t.id,
          instruction: t.instruction,
          criterion: t.criterion,
          result: results.find((r) => r.taskId === t.id) ?? null,
          observations: shown
            .filter((o) => o.taskId === t.id)
            .sort((a, b) => a.momentMs - b.momentMs),
        })),
        // Rejected by the checks, kept apart with their reason (FR-009).
        rejected: observations.filter((o) => checksRejected(o) && o.status === 'proposed'),
        transcript,
        cost: costs.get(usabilityRef(sessionId)) ?? null,
      })
    },

    results: async (actor: Actor, studyId: string) => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return allowed
      // Every analysis, whatever its state: what people decided stays when a session is analysed
      // again, even while it runs or if it fails (FR-010); only decided items count.
      const analyses = await deps.store.analysesOf(studyId)
      const [tasks, observations] = await Promise.all([
        deps.store.taskResultsOf(analyses.map((a) => a.id)),
        deps.store.observationsOf(analyses.map((a) => a.id)),
      ])
      const versions = new Map<number, Awaited<ReturnType<UsabilityDeps['protocols']['version']>>>()
      for (const v of new Set(analyses.map((a) => a.protocolVersion)))
        versions.set(v, await deps.protocols.version(studyId, v))
      // Tasks in the order of the latest version, then those only in older ones.
      const ordered = [...versions.entries()]
        .sort((a, b) => b[0] - a[0])
        .flatMap(([, p]) => p?.tasks ?? [])
      const seen = new Set<string>()
      const taskList = ordered.filter((t) => !seen.has(t.id) && seen.add(t.id))
      const computed = studyResults(
        taskList.map((t) => t.id),
        analyses.map((a) => ({
          sessionId: a.sessionId,
          taskIds: versions.get(a.protocolVersion)?.tasks.map((t) => t.id) ?? [],
          tasks: tasks.filter((t) => t.analysisId === a.id),
          // A person may accept what the checks rejected: only decisions count.
          observations: observations.filter((o) => o.analysisId === a.id),
        })),
      )
      return ok({
        ...computed,
        tasks: computed.tasks.map((t) => ({
          ...t,
          instruction: taskList.find((x) => x.id === t.taskId)?.instruction ?? '',
        })),
      })
    },
  }
}

export type AnalysisQueries = ReturnType<typeof makeAnalysisQueries>
