import { err, newId, ok, type Result } from '@goodresearch/shared'
import { recommendationTranslationRef } from '../../domain/insight-run.ts'
import type { Translation } from '../../domain/insights.ts'
import {
  createRecommendation,
  decideRecommendation,
  editRecommendation,
  type Kind,
  linkInsight,
  markRecommendationReviewed,
  type Rating,
  REC_MAX,
  type RecContext,
  type RecField,
  type Recommendation,
  type RecommendationError,
  unlinkInsight,
} from '../../domain/recommendations.ts'
import { insightsNow } from '../insights-now.ts'
import type { InsightTranslateJob, SynthesisDeps } from '../ports.ts'
import { type ProjectError, type ProjectView, projectNames, projectOf } from '../project.ts'
import { givenTexts, runTranslation, translationAfter } from '../translation.ts'

export type RecommendationCommandError =
  | ProjectError
  | RecommendationError
  | 'RECOMMENDATION_NOT_FOUND'
  | 'VERSION_CONFLICT'

type Given = { readonly en?: string | undefined; readonly fr?: string | undefined }
const FIELDS: readonly RecField[] = ['action', 'rationale', 'successMeasure']

export const makeRecommendationCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  const contextOf = async (
    accountId: string,
    project: ProjectView,
    projectId: string,
    /** Known names are read only when an action is written (review of PR #14). */
    withNames = false,
  ): Promise<RecContext> => ({
    insights: await insightsNow(deps, project, projectId),
    names: withNames ? await projectNames(deps, accountId, project.studyIds) : [],
    by: accountId,
    at: now(),
  })

  const translate = async (
    accountId: string,
    r: Recommendation,
    from: 'en' | 'fr' | null,
    texts: Partial<Record<string, string>>,
  ) => {
    if (!from || Object.keys(texts).length === 0) return
    await deps.enqueueTranslation({
      insightId: r.id,
      target: 'recommendation',
      accountId,
      from,
      texts,
    })
  }

  /** Loads a recommendation of the project at the version seen, applies a change, saves it. */
  const change = async (
    accountId: string,
    projectId: string,
    id: string,
    version: number,
    apply: (r: Recommendation, c: RecContext) => Result<Recommendation, RecommendationCommandError>,
    withNames = false,
  ): Promise<Result<Recommendation, RecommendationCommandError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const r = await deps.store.getRecommendation(id)
    if (!r || r.projectId !== projectId) return err('RECOMMENDATION_NOT_FOUND')
    if (r.version !== version) return err('VERSION_CONFLICT')
    const next = apply(r, await contextOf(accountId, project.value, projectId, withNames))
    if (!next.ok) return next
    if ((await deps.store.saveRecommendation(next.value, version)) === 'stale')
      return err('VERSION_CONFLICT')
    return next
  }

  const decide = (
    accountId: string,
    projectId: string,
    id: string,
    input: { version: number; decision: 'validate' | 'reject' },
  ) =>
    change(accountId, projectId, id, input.version, (r, c) =>
      decideRecommendation(r, input.decision, c),
    )

  /** "Validate all shown", each with its own version check. */
  const validateMany = async (
    accountId: string,
    projectId: string,
    items: readonly { id: string; version: number }[],
  ): Promise<Result<{ done: number; changed: number; blocked: number }, ProjectError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const all = new Map((await deps.store.recommendationsOf(projectId)).map((r) => [r.id, r]))
    const c = await contextOf(accountId, project.value, projectId)
    let done = 0
    let changed = 0
    // Resting only on insights still to decide: said, not silently skipped (review of PR #14).
    let blocked = 0
    for (const item of items) {
      const r = all.get(item.id)
      if (!r || r.version !== item.version) {
        changed++
        continue
      }
      if (r.status !== 'proposed') continue
      const next = decideRecommendation(r, 'validate', c)
      if (!next.ok) {
        blocked++
        continue
      }
      if ((await deps.store.saveRecommendation(next.value, item.version)) === 'stale') changed++
      else done++
    }
    return ok({ done, changed, blocked })
  }

  /** FR-007: an edit in place; a text written in one language is translated in the background. */
  const edit = async (
    accountId: string,
    projectId: string,
    id: string,
    input: {
      version: number
      action?: Given | undefined
      rationale?: Given | undefined
      successMeasure?: Given | undefined
      kind?: Kind | undefined
      impact?: Rating | undefined
      effort?: Rating | undefined
      owner?: string | null | undefined
    },
  ) => {
    let pending: { from: 'en' | 'fr' | null; texts: Partial<Record<string, string>> } = {
      from: null,
      texts: {},
    }
    const saved = await change(
      accountId,
      projectId,
      id,
      input.version,
      (r, c) => {
        const { texts, toTranslate, from, pending: waiting } = givenTexts(FIELDS, input, r)
        pending = { from, texts: toTranslate }
        const owner = input.owner === undefined ? undefined : input.owner?.trim() || null
        const next = editRecommendation(
          r,
          { ...texts, kind: input.kind, impact: input.impact, effort: input.effort, owner },
          c,
        )
        return next.ok
          ? ok({ ...next.value, ...translationAfter(r, Object.keys(texts), from, waiting) })
          : next
      },
      input.action !== undefined,
    )
    if (saved.ok) await translate(accountId, saved.value, pending.from, pending.texts)
    return saved.ok ? ok({ version: saved.value.version }) : saved
  }

  /** FR-007: a recommendation written by hand, validated, with at least one validated insight. */
  const create = async (
    accountId: string,
    projectId: string,
    input: {
      action: Given
      rationale?: Given | undefined
      successMeasure?: Given | undefined
      kind: Kind
      impact: Rating
      effort: Rating
      owner?: string | undefined
      insights: readonly string[]
    },
  ): Promise<Result<{ id: string; version: number }, RecommendationCommandError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const { texts, toTranslate, from, pending } = givenTexts(FIELDS, input, {})
    if (!texts.action) return err('VALIDATION')
    const made = createRecommendation(
      {
        id: newId(),
        projectId,
        action: texts.action,
        rationale: texts.rationale,
        successMeasure: texts.successMeasure,
        kind: input.kind,
        impact: input.impact,
        effort: input.effort,
        owner: input.owner?.trim() || null,
        translation: (from ? 'translating' : 'done') as Translation,
        insights: input.insights,
      },
      await contextOf(accountId, project.value, projectId, true),
    )
    if (!made.ok) return made
    await deps.store.saveRecommendation({ ...made.value, pendingTranslation: pending }, null)
    await translate(accountId, made.value, from, toTranslate)
    return ok({ id: made.value.id, version: made.value.version })
  }

  const link = (
    accountId: string,
    projectId: string,
    id: string,
    insightId: string,
    version: number,
  ) => change(accountId, projectId, id, version, (r, c) => linkInsight(r, insightId, c))

  const unlink = (
    accountId: string,
    projectId: string,
    id: string,
    insightId: string,
    version: number,
  ) =>
    change(accountId, projectId, id, version, (r, c) =>
      r.links.some((l) => l.insightId === insightId && l.state !== 'unlinked')
        ? unlinkInsight(r, insightId, c)
        : err('RECOMMENDATION_NOT_FOUND'),
    )

  const reviewed = (accountId: string, projectId: string, id: string, version: number) =>
    change(accountId, projectId, id, version, (r, c) => markRecommendationReviewed(r, c))

  /** A failed translation tried again: the fields still to translate, from the language written. */
  const retryTranslation = async (
    accountId: string,
    projectId: string,
    id: string,
    version: number,
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const r = await deps.store.getRecommendation(id)
    if (!r || r.projectId !== projectId) return err('RECOMMENDATION_NOT_FOUND' as const)
    if (r.version !== version) return err('VERSION_CONFLICT' as const)
    if (r.translation !== 'not-translated') return ok({ version })
    const from = r.pendingTranslation?.from ?? (await deps.sources.language(accountId))
    const fields = (r.pendingTranslation?.fields as readonly RecField[] | undefined) ?? FIELDS
    const texts = Object.fromEntries(fields.map((f) => [f, r[f]?.[from]]).filter(([, t]) => t))
    const nothing = Object.keys(texts).length === 0
    const next: Recommendation = {
      ...r,
      translation: nothing ? 'done' : 'translating',
      ...(nothing ? { pendingTranslation: null } : {}),
      version: version + 1,
    }
    if ((await deps.store.saveRecommendation(next, version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    if (!nothing) await translate(accountId, next, from, texts)
    return ok({ version: next.version })
  }

  const translateJob = async (job: InsightTranslateJob) => {
    const first = await deps.store.getRecommendation(job.insightId)
    if (!first) return
    await runTranslation(deps, job, {
      load: () => deps.store.getRecommendation(job.insightId),
      save: (r, expected) => deps.store.saveRecommendation(r, expected),
      ref: recommendationTranslationRef(first.projectId),
      max: REC_MAX,
      checked: ['action'],
      names: async () => {
        const project = await projectOf(deps, job.accountId, first.projectId)
        return project.ok ? projectNames(deps, job.accountId, project.value.studyIds) : []
      },
    })
  }

  return {
    decide,
    validateMany,
    edit,
    create,
    link,
    unlink,
    reviewed,
    retryTranslation,
    translateJob,
  }
}
