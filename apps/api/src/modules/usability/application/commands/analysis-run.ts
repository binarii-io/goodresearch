import { err, ok, type Result, sumCosts } from '@goodresearch/shared'
import { RUN_STALE_MS, type SessionAnalysis, usabilityRef } from '../../domain/analysis.ts'
import { estimateInputs, minutesOf } from '../../domain/estimate.ts'
import { AnalysisStopped, runSession } from '../pipeline/run-session.ts'
import type { Actor, AnalysisJob, AnalysisRun, SessionRef, UsabilityDeps } from '../ports.ts'

/** How often a running job says it is alive, well within `RUN_STALE_MS`. */
const HEARTBEAT_MS = 60_000

export type RunFailure =
  | 'STUDY_NOT_FOUND'
  | 'FOLDER_ACCESS_REQUIRED'
  | 'NOT_A_USABILITY_TEST_STUDY'
  | 'NOTHING_TO_ANALYZE'
  | 'ANALYSIS_RUNNING'
  | 'ANALYSIS_CONSENT_REQUIRED'
  | 'USABILITY_NEEDS_VERTEX'
  | 'AI_PROVIDER_REQUIRED'

/** Providers that read video (spec 038 FR-018); the dev and test fake stands for Vertex AI. */
export const readsVideo = (provider: string | null) => provider === 'vertex' || provider === 'fake'

export const isLive = (run: AnalysisRun | null, now: Date): run is AnalysisRun =>
  run !== null &&
  run.state === 'running' &&
  now.getTime() - run.heartbeatAt.getTime() < RUN_STALE_MS

type Ready = SessionRef & { video: NonNullable<SessionRef['video']>; protocolVersion: number }

const isReady = (s: SessionRef): s is Ready =>
  s.readiness === 'ready' && s.video !== null && s.protocolVersion !== null

/**
 * Spec 038 US1: analysing a study's ready sessions in the worker, one run per study. Each session's
 * protocol version is frozen when its analysis starts (FR-008).
 */
export const makeAnalysisRun = (deps: UsabilityDeps) => {
  const gate = async (actor: Actor, studyId: string) => {
    const access = await deps.sessions.access(actor.id, studyId)
    if (access.kind === 'not-found') return err('STUDY_NOT_FOUND' as const)
    if (access.kind === 'folder-required') return err('FOLDER_ACCESS_REQUIRED' as const)
    if (access.type !== 'usability-test') return err('NOT_A_USABILITY_TEST_STUDY' as const)
    return ok(access)
  }

  /** The ready sessions to analyse: never analysed, failed, stopped or out of date; all with `again`. */
  const targets = async (
    actor: Actor,
    studyId: string,
    again: boolean,
    only?: readonly string[],
  ) => {
    const [sessions, analyses] = await Promise.all([
      deps.sessions.list(actor.id, studyId),
      deps.store.analysesOf(studyId),
    ])
    const byId = new Map(analyses.map((a) => [a.sessionId, a]))
    return sessions.filter(isReady).filter((s) => {
      if (only && !only.includes(s.sessionId)) return false
      const a = byId.get(s.sessionId)
      if (!a || again) return true
      return (
        a.state !== 'done' ||
        a.protocolVersion !== s.protocolVersion ||
        a.videoFileId !== s.video.fileId ||
        a.videoModifiedAt !== s.video.modifiedAt ||
        a.videoSize !== s.video.size
      )
    })
  }

  const costOf = async (accountId: string, minutes: number) => {
    const parts = await Promise.all(
      estimateInputs(minutes).map((e) =>
        deps.ai.estimate(accountId, e.inputChars, e.outputTokens, e.tier),
      ),
    )
    return parts.some((p) => p === null) ? null : parts.reduce<number>((a, b) => a + (b ?? 0), 0)
  }

  const estimateOf = async (accountId: string, sessions: readonly Ready[]) => {
    const minutes = sessions.reduce((n, s) => n + minutesOf(s.video.durationMs ?? 60_000), 0)
    if (!sessions.length) return { count: 0, minutes: 0, cost: 0 }
    return { count: sessions.length, minutes, cost: await costOf(accountId, minutes) }
  }

  return {
    estimate: async (actor: Actor, studyId: string, again = false) => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return allowed
      const provider = await deps.ai.providerOf(actor.id)
      const [selected, hour] = await Promise.all([
        targets(actor, studyId, again).then((list) => estimateOf(actor.id, list)),
        costOf(actor.id, 60),
      ])
      return ok({
        ...selected,
        /** Estimated USD per video minute, for one session's estimate; null when a price is unknown. */
        perMinute: hour === null ? null : hour / 60,
        provider,
        readsVideo: readsVideo(provider),
        consentNeeded:
          provider !== null && !(await deps.sessions.hasConsent(actor.id, studyId, provider)),
      })
    },

    start: async (c: {
      actor: Actor
      studyId: string
      sessionIds?: readonly string[] | undefined
      again?: boolean | undefined
      consent?: boolean | undefined
    }): Promise<Result<{ runId: string }, RunFailure>> => {
      const allowed = await gate(c.actor, c.studyId)
      if (!allowed.ok) return allowed
      const provider = await deps.ai.providerOf(c.actor.id)
      if (provider === null) return err('AI_PROVIDER_REQUIRED')
      if (!readsVideo(provider)) return err('USABILITY_NEEDS_VERTEX')
      // FR-017: the video and its transcript go to this provider only with the folder consent.
      if (!(await deps.sessions.hasConsent(c.actor.id, c.studyId, provider))) {
        if (!c.consent) return err('ANALYSIS_CONSENT_REQUIRED')
        await deps.sessions.giveConsent(c.actor.id, c.studyId, provider)
      }
      const list = await targets(c.actor, c.studyId, c.again === true, c.sessionIds)
      if (!list.length) return err('NOTHING_TO_ANALYZE')
      const now = deps.clock.now()
      const run: AnalysisRun = {
        id: deps.newId(),
        studyId: c.studyId,
        startedBy: c.actor.id,
        sessionIds: list.map((s) => s.sessionId),
        state: 'running',
        stopRequested: false,
        startedAt: now,
        heartbeatAt: now,
        finishedAt: null,
      }
      if (!(await deps.store.startRun(run))) return err('ANALYSIS_RUNNING')
      // What each session's analysis was, to put it back if the job cannot be queued.
      const previous = (
        await Promise.all(list.map((s) => deps.store.analysisOf(s.sessionId)))
      ).filter((a): a is SessionAnalysis => a !== null)
      for (const s of list)
        await deps.store.beginAnalysis({
          id: deps.newId(),
          studyId: c.studyId,
          sessionId: s.sessionId,
          protocolVersion: s.protocolVersion,
          videoFileId: s.video.fileId,
          videoModifiedAt: s.video.modifiedAt,
          videoSize: s.video.size,
          state: 'waiting',
          stage: null,
          failure: null,
          runId: run.id,
          startedBy: c.actor.id,
          startedAt: now,
          finishedAt: null,
          version: 1,
        })
      if (!(await deps.enqueue({ runId: run.id, studyId: c.studyId, accountId: c.actor.id }))) {
        // The previous job is still ending: nothing starts, and no session is left waiting.
        for (const a of previous) await deps.store.restoreAnalysis(a)
        await deps.store.finishRun(run.id, 'stopped', now)
        return err('ANALYSIS_RUNNING')
      }
      return ok({ runId: run.id })
    },

    stop: async (actor: Actor, studyId: string, runId: string) => {
      const allowed = await gate(actor, studyId)
      if (!allowed.ok) return allowed
      const run = await deps.store.getRun(runId)
      if (!run || run.studyId !== studyId) return err('STUDY_NOT_FOUND' as const)
      await deps.store.requestStop(runId)
      return ok(undefined)
    },

    /** The worker's job: sessions one after another; a failed one never stops the others. */
    runJob: async (job: AnalysisJob) => {
      const run = await deps.store.getRun(job.runId)
      if (!run || run.state !== 'running') return
      const beat = () => deps.store.heartbeat(run.id, deps.clock.now())
      // Stopped by the person, or no longer the study's run (replaced after it looked stale).
      const stopAsked = async () => {
        const now = await deps.store.getRun(run.id)
        return !now || now.stopRequested || now.state !== 'running'
      }
      // A stage can last long (every observation judged): the run says it is alive meanwhile.
      const pulse = setInterval(() => void beat().catch(() => undefined), HEARTBEAT_MS)
      pulse.unref?.()
      try {
        for (const sessionId of run.sessionIds) {
          const analysis = await deps.store.analysisOf(sessionId)
          if (!analysis || analysis.runId !== run.id || analysis.state !== 'waiting') continue
          if (await stopAsked()) {
            await deps.store.failAnalysis(analysis.id, 'STOPPED', deps.clock.now())
            continue
          }
          await analyseOne(deps, job.accountId, analysis, beat, stopAsked)
          await beat()
        }
        await sweep(deps)
      } finally {
        clearInterval(pulse)
        // Last: until then the job is still running, so a new run cannot be queued beside it.
        await deps.store.finishRun(
          run.id,
          (await stopAsked().catch(() => false)) ? 'stopped' : 'done',
          deps.clock.now(),
        )
      }
    },

    /** Cost of the study's analyses, by session (ledger), whoever ran them (FR-016). */
    costs: async (sessionIds: readonly string[]) => {
      const costs = await deps.ai.costs(sessionIds.map(usabilityRef))
      return { bySession: costs, total: sumCosts(costs.values()) }
    },
  }
}

const analyseOne = async (
  deps: UsabilityDeps,
  accountId: string,
  analysis: SessionAnalysis,
  beat: () => Promise<void>,
  stopAsked: () => Promise<boolean>,
) => {
  const fail = (failure: Parameters<UsabilityDeps['store']['failAnalysis']>[1]) =>
    deps.store.failAnalysis(analysis.id, failure, deps.clock.now())
  try {
    // Inside the try: a failure here fails this session only, never the run.
    const session = await deps.sessions.one(accountId, analysis.sessionId)
    if (!session?.video) return fail('VIDEO_UNREADABLE')
    const protocol = await deps.protocols.version(analysis.studyId, analysis.protocolVersion)
    if (!protocol || protocol.tasks.length === 0) return fail('AI_FAILED')
    const output = await runSession(deps, {
      accountId,
      analysisId: analysis.id,
      session: { ...session, video: session.video },
      protocol,
      stage: async (stage) => {
        await deps.store.setStage(analysis.id, stage)
        await beat()
      },
      checkpoint: async () => {
        await beat()
        if (await stopAsked()) throw new AnalysisStopped('STOPPED')
      },
    })
    // A run replaced meanwhile does not save over the analysis of the run that replaced it.
    if (await stopAsked()) throw new AnalysisStopped('STOPPED')
    await deps.store.completeAnalysis(analysis.id, output, deps.clock.now())
  } catch (error) {
    if (error instanceof AnalysisStopped) return fail(error.failure)
    const name = (error as { name?: string }).name ?? ''
    deps.log.error({ err: error, sessionId: analysis.sessionId }, 'usability analysis failed')
    return fail(
      name === 'AiUnavailable'
        ? 'AI_PROVIDER_REQUIRED'
        : name === 'MediaNotSupported'
          ? 'MEDIA_NOT_SUPPORTED'
          : 'AI_FAILED',
    )
  }
}

/**
 * How old a screenshot nothing refers to must be before the sweep deletes it: an analysis still
 * running stores its screenshots before its observations (a job lasts at most 6 hours).
 */
export const SWEEP_GRACE_MS = 12 * 60 * 60 * 1000

/** Removes the stored screenshots nothing refers to any more (FR-020), once past the grace. */
export const sweep = async (deps: UsabilityDeps, graceMs = SWEEP_GRACE_MS) => {
  const before = new Date(deps.clock.now().getTime() - graceMs)
  const keys = await deps.store.orphanScreenshots(before)
  for (const key of keys) await deps.screens.deleteByPrefix(key).catch(() => 0)
  return keys.length
}

export type AnalysisRunCommands = ReturnType<typeof makeAnalysisRun>
