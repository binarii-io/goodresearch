import { err, newId, ok, type Result } from '@goodresearch/shared'
import { batches, type FactLine, factLines } from '../../domain/fact-lines.ts'
import {
  type InsightRun,
  type InsightsFailure,
  insightsRef,
  interruptedRun,
  isRunLive,
} from '../../domain/insight-run.ts'
import {
  checkInsights,
  type Insight,
  type InsightAnswer,
  mergeInsights,
  snapshotOf,
} from '../../domain/insights.ts'
import {
  AiFailed,
  AiUnavailable,
  type InsightRequest,
  type InsightsJob,
  type SourceFact,
  type SynthesisDeps,
} from '../ports.ts'
import { type ProjectError, projectNames, projectOf } from '../project.ts'

/** A call is tried twice before the run fails (FR-015). */
const ATTEMPTS = 2
/** Research R3: calls at once, and the size of the fact lines of one call. */
const CALLS_PARALLEL = 2
export const BATCH_CHARS = 40_000
// The estimate (research R10): the prompt around each call and its answer.
const CALL_OVERHEAD_CHARS = 3_000
const ANSWER_TOKENS = 6_000

export type StartError =
  | ProjectError
  | 'AI_PROVIDER_REQUIRED'
  | 'INSIGHTS_RUNNING'
  | 'INSIGHTS_CONSENT_REQUIRED'
  | 'NO_FACTS'
  | 'STUDY_ACCESS_REQUIRED'

/** The facts a run sends: accepted ones, and those still to decide when asked (FR-003, update). */
const sendable = (f: SourceFact, withProposed: boolean | undefined) =>
  f.status !== 'rejected' && (withProposed === true || f.status !== 'proposed')

type Choice = {
  studyIds: readonly string[]
  scope: 'all' | 'unlinked'
  withProposed?: boolean | undefined
}

/** Facts linked to an insight (counted or suggested): "Facts not yet in an insight" leaves them. */
const linkedFacts = (insights: readonly Insight[]) =>
  new Set(
    insights
      .filter((i) => i.status !== 'rejected')
      .flatMap((i) => i.links.filter((l) => l.state !== 'unlinked').map((l) => l.factId)),
  )

export const makeInsightRunCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  /** The project's open run, if live; a dead one is closed. */
  const liveRun = async (projectId: string) => {
    const run = await deps.store.openRun(projectId)
    if (!run) return null
    if (isRunLive(run, now())) return run
    await deps.store.saveRun(interruptedRun(run, now()))
    return null
  }

  /** FR-002: the facts a run would send, from the studies chosen that the person can open. */
  const chosen = async (accountId: string, projectId: string, input: Choice) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const open = project.value.studies.filter((s) => s.access)
    if (input.studyIds.some((id) => !open.some((s) => s.id === id)))
      return err('STUDY_ACCESS_REQUIRED' as const)
    const all = await deps.sources.facts(open.map((s) => s.id))
    const linked = linkedFacts(await deps.store.insightsOf(projectId))
    const facts = all.filter(
      (f) =>
        input.studyIds.includes(f.studyId) &&
        sendable(f, input.withProposed) &&
        (input.scope === 'all' || !linked.has(f.id)),
    )
    return ok({ project: project.value, open, all, facts })
  }

  const linesOf = (
    facts: readonly SourceFact[],
    studyIds: readonly string[],
    language: 'en' | 'fr',
  ) => factLines(facts, studyIds, language)

  /** FR-002: the facts, calls and cost of a run, and the studies the person can choose. */
  const estimate = async (accountId: string, projectId: string, input: Choice) => {
    const found = await chosen(accountId, projectId, input)
    if (!found.ok) return found
    const { open, all, facts } = found.value
    const made = linesOf(facts, input.studyIds, await deps.sources.language(accountId))
    const groups = facts.length === 0 ? [] : batches(made.lines, BATCH_CHARS)
    const chars = groups.reduce(
      (n, b) => n + CALL_OVERHEAD_CHARS + b.reduce((m, l) => m + l.text.length + 1, 0),
      0,
    )
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      facts: facts.length,
      calls: groups.length,
      cost:
        provider && groups.length > 0
          ? await deps.ai.estimate(accountId, chars, groups.length * ANSWER_TOKENS, groups.length)
          : provider
            ? 0
            : null,
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, projectId, provider))
        : true,
      aiConnected: provider !== null,
      studies: open.map((s) => ({
        id: s.id,
        name: s.name,
        facts: all.filter((f) => f.studyId === s.id && f.status !== 'proposed').length,
        toDecide: all.filter((f) => f.studyId === s.id && f.status === 'proposed').length,
      })),
    })
  }

  /** FR-002, FR-015, FR-017: one run per project, after consent. */
  const start = async (
    accountId: string,
    projectId: string,
    input: Choice & { consent: boolean },
  ): Promise<Result<{ runId: string }, StartError>> => {
    const found = await chosen(accountId, projectId, input)
    if (!found.ok) return found
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED')
    if (await liveRun(projectId)) return err('INSIGHTS_RUNNING')
    if (found.value.facts.length === 0) return err('NO_FACTS')
    if (!(await deps.store.hasConsent(accountId, projectId, provider))) {
      if (!input.consent) return err('INSIGHTS_CONSENT_REQUIRED')
      await deps.store.giveConsent(accountId, projectId, provider, now())
    }
    const at = now()
    const run: InsightRun = {
      id: newId(),
      projectId,
      teamId: found.value.project.teamId,
      startedBy: accountId,
      studyIds: [...input.studyIds],
      scope: input.scope,
      withProposed: input.withProposed ?? false,
      calls: 0,
      callsDone: 0,
      stopRequested: false,
      leftOut: 0,
      failure: null,
      startedAt: at,
      heartbeatAt: at,
      finishedAt: null,
    }
    if (!(await deps.store.startRun(run))) return err('INSIGHTS_RUNNING')
    // A job of the project still in the queue refuses this one: the run closes.
    if (!(await deps.enqueueRun({ runId: run.id, projectId }))) {
      await deps.store.saveRun(interruptedRun(run, now()))
      return err('INSIGHTS_RUNNING')
    }
    return ok({ runId: run.id })
  }

  const stop = async (accountId: string, projectId: string, runId: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const run = await deps.store.getRun(runId)
    if (!run || run.projectId !== projectId) return err('NOT_FOUND' as const)
    await deps.store.requestStop(runId)
    return ok(undefined)
  }

  const giveConsent = async (accountId: string, projectId: string) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED' as const)
    await deps.store.giveConsent(accountId, projectId, provider, now())
    return ok(undefined)
  }

  /** Research R2: what one call sends — its facts, their themes, the insights of those themes. */
  const requestOf = (
    goal: string,
    batch: readonly FactLine[],
    themes: ReadonlyMap<string, { key: string; title: string | null }>,
    refsOfFact: ReadonlyMap<string, string>,
    insights: readonly Insight[],
  ) => {
    const used = new Set(batch.map((l) => l.theme))
    const keys = new Map(
      [...themes].filter(([ref]) => used.has(ref)).map(([ref, t]) => [t.key, ref]),
    )
    const insightRefs = new Map<string, string>()
    const sent = insights
      .filter((i) => i.status !== 'rejected' && keys.has(i.theme.key))
      .map((i) => {
        const ref = `i${insightRefs.size + 1}`
        insightRefs.set(ref, i.id)
        const refsOf = (role: 'support' | 'counter') =>
          i.links
            .filter((l) => l.role === role && l.state !== 'unlinked')
            .flatMap((l) => refsOfFact.get(l.factId) ?? [])
        return {
          ref,
          theme: keys.get(i.theme.key) ?? 'other',
          statement: i.statement.en,
          support: refsOf('support'),
          counter: refsOf('counter'),
        }
      })
    const request: InsightRequest = {
      goal,
      themes: [...themes]
        .filter(([ref]) => used.has(ref) && ref !== 'other')
        .map(([ref, t]) => ({ ref, title: t.title ?? '' })),
      facts: batch.map((l) => l.text),
      insights: sent,
      avoid: insights
        .filter((i) => i.status === 'rejected' && keys.has(i.theme.key))
        .map((i) => i.statement.en),
    }
    return { request, insightRefs }
  }

  /** The worker's job (research R3, R5): calls 2 at once, each merged as it comes. */
  const work = async (job: InsightsJob): Promise<void> => {
    let run = await deps.store.getRun(job.runId)
    if (!run || run.finishedAt) return
    const by = run.startedBy
    const save = async (change: Partial<InsightRun>) => {
      if (!run) return
      run = { ...run, ...change, heartbeatAt: now() }
      await deps.store.saveRun(run)
    }
    const finish = (failure: InsightsFailure | null) => save({ failure, finishedAt: now() })
    const project = await deps.sources.project(by, run.projectId)
    if (!project) return finish('INTERRUPTED')
    const withProposed = run.withProposed
    const facts = (await deps.sources.facts(run.studyIds)).filter((f) => sendable(f, withProposed))
    const linked = linkedFacts(await deps.store.insightsOf(run.projectId))
    const sent = run.scope === 'all' ? facts : facts.filter((f) => !linked.has(f.id))
    if (sent.length === 0) return finish('NO_FACTS')
    const made = linesOf(sent, run.studyIds, await deps.sources.language(by))
    const groups = batches(made.lines, BATCH_CHARS)
    await save({ calls: groups.length })
    const names = await projectNames(deps, by, run.studyIds)
    const snapshots = new Map(sent.map((f) => [f.id, snapshotOf(f)]))
    const participants = new Map(
      sent.map((f) => [f.id, f.participants.map((p) => `${f.studyId}|${p}`)]),
    )
    const refsOfFact = new Map([...made.refs].map(([ref, id]) => [id, ref]))

    let failure: InsightsFailure | null = null
    const call = async (n: number, batch: readonly FactLine[]) => {
      const insights = await deps.store.insightsOf(run?.projectId ?? job.projectId)
      const { request, insightRefs } = requestOf(
        project.goal,
        batch,
        made.themes,
        refsOfFact,
        insights,
      )
      for (let attempt = 1; ; attempt++) {
        try {
          const answer = await deps.ai.insights(by, insightsRef(job.runId, n), request)
          return { answer, insightRefs }
        } catch (error) {
          if (error instanceof AiUnavailable) throw error
          if (attempt >= ATTEMPTS) throw error
        }
      }
    }
    const merge = async (
      answer: readonly InsightAnswer[],
      insightRefs: ReadonlyMap<string, string>,
    ) => {
      const checked = checkInsights(
        answer.map((a) => ({
          ...a,
          ref: a.ref ? (insightRefs.get(a.ref) ?? `unknown:${a.ref}`) : undefined,
        })),
        made.refs,
        made.themes,
        names,
        participants,
      )
      const existing = await deps.store.insightsOf(job.projectId)
      const merged = mergeInsights(existing, checked.kept, job.projectId, {
        runId: job.runId,
        at: now(),
        snapshots,
        newId,
      })
      const versions = new Map(existing.map((i) => [i.id, i.version]))
      const { skipped } = await deps.store.applyRun({
        creates: merged.creates,
        updates: merged.updates.map((insight) => ({
          insight,
          expected: versions.get(insight.id) ?? insight.version - 1,
        })),
      })
      return checked.leftOut + merged.leftOut + skipped
    }

    for (let i = 0; i < groups.length; i += CALLS_PARALLEL) {
      const current = await deps.store.getRun(job.runId)
      if (!current || current.finishedAt || current.stopRequested) break
      const slice = groups.slice(i, i + CALLS_PARALLEL)
      const answers = await Promise.allSettled(slice.map((b, k) => call(i + k + 1, b)))
      for (const a of answers) {
        if (a.status === 'rejected') {
          failure =
            a.reason instanceof AiUnavailable
              ? 'AI_PROVIDER_REQUIRED'
              : a.reason instanceof AiFailed && a.reason.invalid
                ? 'INVALID_ANSWER'
                : 'AI_FAILED'
          deps.log.warn({ runId: job.runId, failure }, 'insights call failed')
          continue
        }
        // FR-015: a call answered after a stop is not kept.
        if ((await deps.store.getRun(job.runId))?.stopRequested) break
        const leftOut = await merge(a.value.answer, a.value.insightRefs)
        await save({ callsDone: (run?.callsDone ?? 0) + 1, leftOut: (run?.leftOut ?? 0) + leftOut })
      }
      if (failure === 'AI_PROVIDER_REQUIRED') break
    }
    await finish(failure)
  }

  /** Whatever fails outside an AI call (a database or a source), the run ends, never left open. */
  const runJob = async (job: InsightsJob): Promise<void> => {
    try {
      await work(job)
    } catch (error) {
      deps.log.warn({ runId: job.runId, error: String(error) }, 'insights run failed')
      const run = await deps.store.getRun(job.runId)
      if (run && !run.finishedAt)
        await deps.store.saveRun({
          ...run,
          failure: 'INTERRUPTED',
          finishedAt: now(),
          heartbeatAt: now(),
        })
    }
  }

  return { estimate, start, stop, giveConsent, runJob }
}
