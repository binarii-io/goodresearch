import { err, newId, ok, type Result } from '@goodresearch/shared'
import {
  type InsightsFailure,
  interruptedRun,
  isRunLive,
  type RecommendationRun,
  recommendationsRef,
} from '../../domain/insight-run.ts'
import {
  checkRecommendations,
  mergeRecommendations,
  type Recommendation,
} from '../../domain/recommendations.ts'
import { type InsightLine, insightLine, insightsNow, readable } from '../insights-now.ts'
import { AiFailed, AiUnavailable, type InsightsJob, type SynthesisDeps } from '../ports.ts'
import { type ProjectError, projectNames, projectOf } from '../project.ts'

/** A call is tried twice before the run fails (FR-011). */
const ATTEMPTS = 2
// The estimate: the prompt around the call and its answer.
const CALL_OVERHEAD_CHARS = 3_000
const ANSWER_TOKENS = 5_000

export type RecommendationStartError =
  | ProjectError
  | 'AI_PROVIDER_REQUIRED'
  | 'RECOMMENDATIONS_RUNNING'
  | 'INSIGHTS_CONSENT_REQUIRED'
  | 'NO_INSIGHTS'

/** Research R2: one line per insight, with its ref. */
const lineOf = (ref: string, i: InsightLine, language: 'en' | 'fr') =>
  `${ref} | ${insightLine(i, language)}`

export const makeRecommendationRunCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  const liveRun = async (projectId: string) => {
    const run = await deps.store.openRecommendationRun(projectId)
    if (!run) return null
    if (isRunLive(run, now())) return run
    await deps.store.saveRecommendationRun(interruptedRun(run, now()))
    return null
  }

  const chosen = async (accountId: string, projectId: string, withProposed: boolean) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const insights = [...(await insightsNow(deps, project.value, projectId)).values()].filter((i) =>
      readable(i.status, withProposed),
    )
    return ok({ project: project.value, insights })
  }

  /** FR-002: the insights and the cost a run would take. */
  const estimate = async (
    accountId: string,
    projectId: string,
    input: { withProposed: boolean },
  ) => {
    const found = await chosen(accountId, projectId, input.withProposed)
    if (!found.ok) return found
    const language = await deps.sources.language(accountId)
    const chars =
      CALL_OVERHEAD_CHARS +
      found.value.insights.reduce((n, i, k) => n + lineOf(`i${k + 1}`, i, language).length + 1, 0)
    const provider = await deps.ai.providerOf(accountId)
    const count = found.value.insights.length
    return ok({
      insights: count,
      cost:
        provider && count > 0
          ? await deps.ai.estimate(accountId, chars, ANSWER_TOKENS, 1, 'recommendations')
          : provider
            ? 0
            : null,
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, projectId, provider))
        : true,
      aiConnected: provider !== null,
    })
  }

  /** FR-002, FR-011, FR-013: one run per project, after consent. */
  const start = async (
    accountId: string,
    projectId: string,
    input: { withProposed: boolean; consent: boolean },
  ): Promise<Result<{ runId: string }, RecommendationStartError>> => {
    const found = await chosen(accountId, projectId, input.withProposed)
    if (!found.ok) return found
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED')
    if (await liveRun(projectId)) return err('RECOMMENDATIONS_RUNNING')
    if (found.value.insights.length === 0) return err('NO_INSIGHTS')
    if (!(await deps.store.hasConsent(accountId, projectId, provider))) {
      if (!input.consent) return err('INSIGHTS_CONSENT_REQUIRED')
      await deps.store.giveConsent(accountId, projectId, provider, now())
    }
    const at = now()
    const run: RecommendationRun = {
      id: newId(),
      projectId,
      teamId: found.value.project.teamId,
      startedBy: accountId,
      withProposed: input.withProposed,
      calls: 1,
      callsDone: 0,
      stopRequested: false,
      leftOut: 0,
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.store.startRecommendationRun(run))) return err('RECOMMENDATIONS_RUNNING')
    if (!(await deps.enqueueRecommendations({ runId: run.id, projectId }))) {
      await deps.store.saveRecommendationRun(interruptedRun(run, now()))
      return err('RECOMMENDATIONS_RUNNING')
    }
    return ok({ runId: run.id })
  }

  const stop = async (accountId: string, projectId: string, runId: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const run = await deps.store.getRecommendationRun(runId)
    if (!run || run.projectId !== projectId) return err('NOT_FOUND' as const)
    await deps.store.requestRecommendationStop(runId)
    return ok(undefined)
  }

  /** The worker's job (research R2): one call, merged as insights are (FR-005). */
  const work = async (job: InsightsJob): Promise<void> => {
    let run = await deps.store.getRecommendationRun(job.runId)
    if (!run || run.finishedAt) return
    const by = run.startedBy
    const save = async (change: Partial<RecommendationRun>) => {
      if (!run) return
      run = { ...run, ...change, heartbeatAt: now() }
      await deps.store.saveRecommendationRun(run)
    }
    const finish = (failure: InsightsFailure | null) => save({ failure, finishedAt: now() })
    const project = await projectOf(deps, by, job.projectId)
    if (!project.ok) return finish('INTERRUPTED')
    const all = await insightsNow(deps, project.value, job.projectId)
    const sent = [...all.values()].filter((i) => readable(i.status, run?.withProposed ?? false))
    if (sent.length === 0) return finish('NO_INSIGHTS')
    const language = await deps.sources.language(by)
    const refs = new Map(sent.map((i, k) => [`i${k + 1}`, i.id]))
    const refOf = new Map([...refs].map(([ref, id]) => [id, ref]))
    const existing = await deps.store.recommendationsOf(job.projectId)
    const recRefs = new Map<string, string>()
    const describe = (r: Recommendation) =>
      `${r.kind} | ${r.action[language] || r.action.en} | insights ${r.links
        .filter((l) => l.state !== 'unlinked')
        .flatMap((l) => refOf.get(l.insightId) ?? [])
        .join(',')}`
    const request = {
      goal: project.value.goal,
      insights: sent.map((i, k) => lineOf(`i${k + 1}`, i, language)),
      recommendations: existing
        .filter((r) => r.status !== 'rejected')
        .map((r) => {
          const ref = `r${recRefs.size + 1}`
          recRefs.set(ref, r.id)
          return `${ref} | ${describe(r)}`
        }),
      avoid: existing.filter((r) => r.status === 'rejected').map((r) => r.action.en),
    }
    let answer: Awaited<ReturnType<typeof deps.ai.recommendations>> | null = null
    for (let attempt = 1; answer === null; attempt++) {
      if ((await deps.store.getRecommendationRun(job.runId))?.stopRequested) return finish(null)
      try {
        answer = await deps.ai.recommendations(by, recommendationsRef(job.runId, 1), request)
      } catch (error) {
        if (error instanceof AiUnavailable) return finish('AI_PROVIDER_REQUIRED')
        if (attempt >= ATTEMPTS)
          return finish(error instanceof AiFailed && error.invalid ? 'INVALID_ANSWER' : 'AI_FAILED')
      }
    }
    // FR-011: an answer coming after a stop is not kept.
    if ((await deps.store.getRecommendationRun(job.runId))?.stopRequested) return finish(null)
    const names = await projectNames(deps, by, project.value.studyIds)
    const checked = checkRecommendations(
      answer.map((a) => ({
        ...a,
        ref: a.ref ? (recRefs.get(a.ref) ?? `unknown:${a.ref}`) : undefined,
      })),
      refs,
      names,
    )
    const current = await deps.store.recommendationsOf(job.projectId)
    const merged = mergeRecommendations(current, checked.kept, job.projectId, {
      runId: job.runId,
      at: now(),
      insights: all,
      newId,
    })
    const versions = new Map(current.map((r) => [r.id, r.version]))
    const { skipped } = await deps.store.applyRecommendations({
      creates: merged.creates,
      updates: merged.updates.map((recommendation) => ({
        recommendation,
        expected: versions.get(recommendation.id) ?? recommendation.version - 1,
      })),
    })
    await save({ callsDone: 1, leftOut: checked.leftOut + merged.leftOut + skipped })
    return finish(null)
  }

  /** Whatever fails outside the AI call, the run ends, never left open. */
  const runJob = async (job: InsightsJob): Promise<void> => {
    try {
      await work(job)
    } catch (error) {
      deps.log.warn({ runId: job.runId, error: String(error) }, 'recommendations run failed')
      const run = await deps.store.getRecommendationRun(job.runId)
      if (run && !run.finishedAt)
        await deps.store.saveRecommendationRun({
          ...run,
          failure: 'INTERRUPTED',
          finishedAt: now(),
          heartbeatAt: now(),
        })
    }
  }

  return { estimate, start, stop, runJob }
}
