import { err, ok, withPlaceholders } from '@goodresearch/shared'
import { takeawaysRef, takeawaysTranslationRef } from '../../domain/insight-run.ts'
import { priority, type Recommendation } from '../../domain/recommendations.ts'
import { checkDraft, TAKEAWAYS_MAX, type Takeaways } from '../../domain/takeaways.ts'
import { type InsightLine, insightLine, insightsNow, readable } from '../insights-now.ts'
import {
  AiUnavailable,
  type InsightTranslateJob,
  type SynthesisDeps,
  type TakeawaysJob,
} from '../ports.ts'
import { projectNames, projectOf } from '../project.ts'
import { basisOf, blankTakeaways, takeawaysBasis } from '../takeaways-basis.ts'
import { givenTexts, runTranslation } from '../translation.ts'

/**
 * What the draft sees of the whole (spec 014, update): the panel, the insights by confidence,
 * theme and polarity, the recommendations by kind; counts only, the app never sends shares.
 */
export const overviewOf = (
  insights: readonly InsightLine[],
  recommendations: readonly Recommendation[],
): string[] => {
  const count = <T extends string>(items: readonly T[], keys: readonly T[]) =>
    keys.map((k) => `${k} ${items.filter((x) => x === k).length}`).join(', ')
  const themes = new Map<string, number>()
  for (const i of insights) {
    const title = i.themeTitle ?? 'Other'
    themes.set(title, (themes.get(title) ?? 0) + 1)
  }
  return [
    `panel: ${insights[0]?.panel ?? 0} participants with accepted facts`,
    `insights: ${insights.length} (${count(
      insights.map((i) => i.level),
      ['high', 'medium', 'low'],
    )})`,
    `themes: ${[...themes].map(([title, n]) => `${title} ${n}`).join(', ')}`,
    `polarity: ${count(
      insights.map((i) => i.polarity),
      ['negative', 'positive', 'mixed', 'neutral'],
    )}`,
    `recommendations: ${recommendations.length} (${count(
      recommendations.map((r) => r.kind),
      ['build', 'test', 'investigate'],
    )})`,
  ]
}

// The estimate of a draft: the prompt around the call and the answer.
const DRAFT_OVERHEAD_CHARS = 2_500
const DRAFT_ANSWER_TOKENS = 800

/** A draft is "drafting" for at most this long: then a new one may start (worker gone). */
const DRAFT_STALE_MS = 10 * 60_000

export const makeTakeawaysCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  /** FR-010: a person saves the takeaways (written, or a draft used); translated in the background. */
  const save = async (
    accountId: string,
    projectId: string,
    input: {
      version: number
      text: { en?: string | undefined; fr?: string | undefined }
      /** The text is the AI draft used as is: it rests on what the draft read. */
      fromDraft?: boolean | undefined
    },
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const current = (await deps.store.getTakeaways(projectId)) ?? blankTakeaways(projectId)
    if (current.version !== input.version) return err('VERSION_CONFLICT' as const)
    const { texts, toTranslate, from, pending } = givenTexts(
      ['text'],
      { text: input.text },
      current,
    )
    const text = texts.text ?? current.text
    if (text.en.length > TAKEAWAYS_MAX || text.fr.length > TAKEAWAYS_MAX)
      return err('VALIDATION' as const)
    // The draft's basis goes with the draft's own text only (review of PR #14).
    const draftText = current.draft.text
    const usesDraft =
      input.fromDraft === true &&
      draftText !== null &&
      text.en === draftText.en &&
      text.fr === draftText.fr
    const withProposed = usesDraft ? current.draft.withProposed : current.withProposed
    const next: Takeaways = {
      ...current,
      text,
      translation: from ? 'translating' : 'done',
      pendingTranslation: pending,
      savedBy: accountId,
      savedAt: now(),
      version: current.version + 1,
      withProposed,
      savedOver:
        usesDraft && current.draft.savedOver
          ? current.draft.savedOver
          : await takeawaysBasis(deps, project.value, projectId, withProposed),
    }
    if ((await deps.store.saveTakeaways(next, input.version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    if (from)
      await deps.enqueueTranslation({
        insightId: projectId,
        target: 'takeaways',
        accountId,
        from,
        texts: toTranslate,
      })
    return ok({ version: next.version })
  }

  /** FR-010: "Draft with the AI": the draft is never saved as the takeaways by itself. */
  const draft = async (
    accountId: string,
    projectId: string,
    input: { consent: boolean; withProposed?: boolean | undefined },
  ) => {
    const withProposed = input.withProposed ?? false
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const provider = await deps.ai.providerOf(accountId)
    if (!provider) return err('AI_PROVIDER_REQUIRED' as const)
    const current = await deps.store.getTakeaways(projectId)
    const at = current?.draft.at
    if (
      current?.draft.state === 'drafting' &&
      at &&
      now().getTime() - at.getTime() < DRAFT_STALE_MS
    )
      return err('TAKEAWAYS_DRAFTING' as const)
    const insights = await deps.store.insightsOf(projectId)
    if (!insights.some((i) => readable(i.status, withProposed))) return err('NO_INSIGHTS' as const)
    if (!(await deps.store.hasConsent(accountId, projectId, provider))) {
      if (!input.consent) return err('INSIGHTS_CONSENT_REQUIRED' as const)
      await deps.store.giveConsent(accountId, projectId, provider, now())
    }
    await deps.store.saveDraft(projectId, {
      text: current?.draft.text ?? null,
      savedOver: current?.draft.savedOver ?? null,
      state: 'drafting',
      by: accountId,
      at: now(),
      withProposed,
    })
    if (!(await deps.enqueueTakeaways({ projectId, accountId, withProposed }))) {
      await deps.store.saveDraft(projectId, {
        text: current?.draft.text ?? null,
        savedOver: current?.draft.savedOver ?? null,
        state: 'failed',
        by: accountId,
        at: now(),
        withProposed,
      })
      return err('TAKEAWAYS_DRAFTING' as const)
    }
    return ok(undefined)
  }

  /**
   * The draft job (research R2): the validated insights and recommendations, and those still to
   * decide when asked (marked so for the AI).
   */
  const draftJob = async (job: TakeawaysJob): Promise<void> => {
    const withProposed = job.withProposed ?? false
    // A failed draft keeps the one before (review of PR #14).
    const before = (await deps.store.getTakeaways(job.projectId))?.draft
    const fail = () =>
      deps.store.saveDraft(job.projectId, {
        text: before?.text ?? null,
        savedOver: before?.savedOver ?? null,
        state: 'failed',
        by: job.accountId,
        at: now(),
        withProposed,
      })
    try {
      const project = await projectOf(deps, job.accountId, job.projectId)
      if (!project.ok) return fail()
      const language = await deps.sources.language(job.accountId)
      const names = await projectNames(deps, job.accountId, project.value.studyIds)
      const rawInsights = await deps.store.insightsOf(job.projectId)
      const lines = await insightsNow(deps, project.value, job.projectId, rawInsights)
      const insights = [...lines.values()].filter((i) => readable(i.status, withProposed))
      const allRecommendations = await deps.store.recommendationsOf(job.projectId)
      const recommendations = allRecommendations.filter((r) => readable(r.status, withProposed))
      // What this draft reads: its text rests on it once used.
      const readBasis = basisOf(rawInsights, lines, allRecommendations, withProposed)
      const mark = (status: string) => (status === 'proposed' ? 'to validate | ' : '')
      const sentences = await deps.ai.takeaways(job.accountId, takeawaysRef(job.projectId), {
        goal: project.value.goal,
        current: await (async () => {
          const saved = await deps.store.getTakeaways(job.projectId)
          return saved ? withPlaceholders(saved.text[language] || saved.text.en, names).text : ''
        })(),
        overview: overviewOf(insights, recommendations),
        insights: insights.map((i) => `${mark(i.status)}${insightLine(i, language)}`),
        recommendations: recommendations.map(
          (r) =>
            `${mark(r.status)}${r.kind} | priority ${priority(r.impact, r.effort)} | ${r.action[language] || r.action.en}`,
        ),
      })
      const text = checkDraft(sentences, names)
      if (!text) return fail()
      await deps.store.saveDraft(job.projectId, {
        text,
        savedOver: readBasis,
        state: 'ready',
        by: job.accountId,
        at: now(),
        withProposed,
      })
    } catch (error) {
      if (!(error instanceof AiUnavailable))
        deps.log.warn({ error: String(error) }, 'takeaways draft failed')
      await fail()
    }
  }

  /** A failed translation tried again, from the language written. */
  const retryTranslation = async (accountId: string, projectId: string, version: number) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const t = await deps.store.getTakeaways(projectId)
    if (!t) return err('NOT_FOUND' as const)
    if (t.version !== version) return err('VERSION_CONFLICT' as const)
    if (t.translation !== 'not-translated') return ok({ version })
    const from = t.pendingTranslation?.from ?? (await deps.sources.language(accountId))
    const text = t.text[from]
    const next: Takeaways = {
      ...t,
      translation: text ? 'translating' : 'done',
      version: version + 1,
    }
    if ((await deps.store.saveTakeaways(next, version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    if (text)
      await deps.enqueueTranslation({
        insightId: projectId,
        target: 'takeaways',
        accountId,
        from,
        texts: { text },
      })
    return ok({ version: next.version })
  }

  const translateJob = (job: InsightTranslateJob) =>
    runTranslation(deps, job, {
      load: () => deps.store.getTakeaways(job.insightId),
      save: (t, expected) => deps.store.saveTakeaways(t, expected),
      ref: takeawaysTranslationRef(job.insightId),
      max: { text: TAKEAWAYS_MAX },
      checked: ['text'],
      names: async () => {
        const project = await projectOf(deps, job.accountId, job.insightId)
        return project.ok ? projectNames(deps, job.accountId, project.value.studyIds) : []
      },
    })

  /** FR-012: what a draft would read and cost, shown before it runs. */
  const estimate = async (
    accountId: string,
    projectId: string,
    input: { withProposed: boolean },
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const language = await deps.sources.language(accountId)
    const lines = [...(await insightsNow(deps, project.value, projectId)).values()].filter((i) =>
      readable(i.status, input.withProposed),
    )
    const recommendations = (await deps.store.recommendationsOf(projectId)).filter((r) =>
      readable(r.status, input.withProposed),
    )
    // Everything the draft sends: the lines and their marks, the overview, the text saved.
    const saved = await deps.store.getTakeaways(projectId)
    const mark = (status: string) => (status === 'proposed' ? 'to validate | '.length : 0)
    const chars =
      DRAFT_OVERHEAD_CHARS +
      (saved ? (saved.text[language] || saved.text.en).length : 0) +
      overviewOf(lines, recommendations).reduce((n, l) => n + l.length + 1, 0) +
      lines.reduce((n, i) => n + mark(i.status) + insightLine(i, language).length + 1, 0) +
      recommendations.reduce(
        (n, r) => n + mark(r.status) + (r.action[language] || r.action.en).length + 40,
        0,
      )
    const provider = await deps.ai.providerOf(accountId)
    return ok({
      items: lines.length + recommendations.length,
      cost:
        provider && lines.length > 0
          ? await deps.ai.estimate(accountId, chars, DRAFT_ANSWER_TOKENS, 1, 'takeaways')
          : provider
            ? 0
            : null,
      consentNeeded: provider
        ? !(await deps.store.hasConsent(accountId, projectId, provider))
        : true,
      aiConnected: provider !== null,
    })
  }

  return { save, draft, draftJob, retryTranslation, translateJob, estimate }
}
