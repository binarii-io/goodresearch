import { err, holdsName, newId, ok, type Result } from '@goodresearch/shared'
import {
  createInsight,
  type DecisionContext,
  decide,
  editInsight,
  type InsightError,
  type InsightTexts,
  linkFact,
  markReviewed,
  unlinkFact,
} from '../../domain/decisions.ts'
import { insightTranslationRef } from '../../domain/insight-run.ts'
import {
  type Bilingual,
  FIELD_MAX,
  type Insight,
  type InsightField,
  type PendingTranslation,
  type ProjectTheme,
} from '../../domain/insights.ts'
import type { InsightTranslateJob, SynthesisDeps, TranslatedTexts } from '../ports.ts'
import {
  type ProjectError,
  type ProjectView,
  projectNames,
  projectOf,
  projectThemes,
} from '../project.ts'

export type CommandError = ProjectError | InsightError | 'INSIGHT_NOT_FOUND' | 'VERSION_CONFLICT'

type Given = { readonly en?: string | undefined; readonly fr?: string | undefined }
type GivenTexts = {
  readonly statement?: Given | undefined
  readonly description?: Given | undefined
  readonly counterEvidence?: Given | undefined
  readonly minorityView?: Given | undefined
}
const FIELDS = ['statement', 'description', 'counterEvidence', 'minorityView'] as const

/**
 * A person's texts, in one language or both (spec 012 research R9): a field given in one language
 * keeps the other's words until its translation comes; `from` is set when one is to translate.
 */
const textsOf = (
  given: GivenTexts,
  current: Partial<Record<(typeof FIELDS)[number], Bilingual>>,
) => {
  const texts: Partial<Record<(typeof FIELDS)[number], Bilingual>> = {}
  const toTranslate: TranslatedTexts = {}
  let from: 'en' | 'fr' | null = null
  for (const field of FIELDS) {
    const g = given[field]
    if (!g || (g.en === undefined && g.fr === undefined)) continue
    const before = current[field] ?? { en: '', fr: '' }
    const en = g.en?.trim()
    const fr = g.fr?.trim()
    // A text cleared in one language is cleared in both: there is nothing to translate.
    if ((en === '' && fr === undefined) || (fr === '' && en === undefined)) {
      texts[field] = { en: '', fr: '' }
      continue
    }
    texts[field] = { en: en ?? before.en, fr: fr ?? before.fr }
    if (en !== undefined && fr === undefined) {
      from = 'en'
      toTranslate[field] = en
    } else if (fr !== undefined && en === undefined) {
      from = from ?? 'fr'
      toTranslate[field] = fr
    }
  }
  const pending: PendingTranslation | null = from
    ? { from, fields: FIELDS.filter((f) => toTranslate[f] !== undefined) }
    : null
  return { texts, toTranslate, from, pending }
}

/** The words a translation job was asked for are still the insight's. */
const wordsStill = (insight: Insight, job: InsightTranslateJob) =>
  Object.entries(job.texts).every(
    ([field, text]) => insight[field as InsightField][job.from] === text,
  )

export const makeInsightCommands = (deps: SynthesisDeps) => {
  const now = () => deps.clock.now()

  const contextOf = async (
    accountId: string,
    project: ProjectView,
    factIds: readonly string[],
  ): Promise<DecisionContext> => {
    const facts = await deps.sources.factsByIds([...new Set(factIds)])
    return {
      facts: new Map(facts.map((f) => [f.id, f])),
      studies: project.studyIds,
      names: await projectNames(deps, accountId, project.studyIds),
      by: accountId,
      at: now(),
    }
  }

  const themeOf = async (
    accountId: string,
    project: ProjectView,
    key: string,
  ): Promise<ProjectTheme | null> => {
    const facts = await deps.sources.facts([...project.studyIds])
    return (
      (await projectThemes(deps, accountId, project.studies, facts)).find((t) => t.key === key) ??
      null
    )
  }

  const translate = async (
    accountId: string,
    insight: Insight,
    from: 'en' | 'fr' | null,
    texts: TranslatedTexts,
  ) => {
    if (!from || Object.keys(texts).length === 0) return
    await deps.enqueueTranslation({ insightId: insight.id, accountId, from, texts })
  }

  /** Loads an insight of the project with the version the person saw, then applies a change. */
  const change = async (
    accountId: string,
    projectId: string,
    insightId: string,
    version: number,
    apply: (i: Insight, project: ProjectView) => Promise<Result<Insight, CommandError>>,
  ): Promise<Result<Insight, CommandError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const insight = await deps.store.getInsight(insightId)
    if (!insight || insight.projectId !== projectId) return err('INSIGHT_NOT_FOUND')
    if (insight.version !== version) return err('VERSION_CONFLICT')
    const next = await apply(insight, project.value)
    if (!next.ok) return next
    if ((await deps.store.saveInsight(next.value, version)) === 'stale')
      return err('VERSION_CONFLICT')
    return next
  }

  const factIdsOf = (i: Insight, more: readonly string[] = []) => [
    ...i.links.map((l) => l.factId),
    ...more,
  ]

  /** FR-010: validate or reject. */
  const decideOne = (
    accountId: string,
    projectId: string,
    insightId: string,
    input: { version: number; decision: 'validate' | 'reject' },
  ) =>
    change(accountId, projectId, insightId, input.version, async (i, project) =>
      decide(i, input.decision, await contextOf(accountId, project, factIdsOf(i))),
    )

  /** FR-010: "Validate all shown", each with its own version check. */
  const validateMany = async (
    accountId: string,
    projectId: string,
    items: readonly { id: string; version: number }[],
  ): Promise<Result<{ done: number; changed: number }, ProjectError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const all = new Map((await deps.store.insightsOf(projectId)).map((i) => [i.id, i]))
    const context = await contextOf(
      accountId,
      project.value,
      items.flatMap((x) => (all.get(x.id) ? factIdsOf(all.get(x.id) as Insight) : [])),
    )
    let done = 0
    let changed = 0
    for (const item of items) {
      const insight = all.get(item.id)
      if (!insight || insight.version !== item.version) {
        changed++
        continue
      }
      if (insight.status !== 'proposed') continue
      const next = decide(insight, 'validate', context)
      if (!next.ok) continue
      if ((await deps.store.saveInsight(next.value, item.version)) === 'stale') changed++
      else done++
    }
    return ok({ done, changed })
  }

  /** FR-010: a person's edit; a field written in one language is translated in the background. */
  const edit = async (
    accountId: string,
    projectId: string,
    insightId: string,
    input: GivenTexts & { version: number; themeKey?: string | undefined },
  ) => {
    let pending: { from: 'en' | 'fr' | null; texts: TranslatedTexts } = { from: null, texts: {} }
    const saved = await change(
      accountId,
      projectId,
      insightId,
      input.version,
      async (i, project) => {
        const theme = input.themeKey ? await themeOf(accountId, project, input.themeKey) : undefined
        if (theme === null) return err('VALIDATION')
        const { texts, toTranslate, from, pending: waiting } = textsOf(input, i)
        pending = { from, texts: toTranslate }
        const changes: InsightTexts = { ...texts, theme }
        const next = editInsight(i, changes, await contextOf(accountId, project, factIdsOf(i)))
        return next.ok && from
          ? ok({ ...next.value, translation: 'translating' as const, pendingTranslation: waiting })
          : next
      },
    )
    if (saved.ok) await translate(accountId, saved.value, pending.from, pending.texts)
    return saved.ok ? ok({ version: saved.value.version }) : saved
  }

  /** FR-010: an insight written by hand, validated, with its supporting facts. */
  const create = async (
    accountId: string,
    projectId: string,
    input: GivenTexts & {
      themeKey: string
      statement: Given
      support: readonly string[]
      counter?: readonly string[] | undefined
    },
  ): Promise<Result<{ id: string; version: number }, CommandError>> => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const theme = await themeOf(accountId, project.value, input.themeKey)
    if (!theme) return err('VALIDATION')
    const { texts, toTranslate, from, pending } = textsOf(input, {})
    if (!texts.statement) return err('VALIDATION')
    const context = await contextOf(accountId, project.value, [
      ...input.support,
      ...(input.counter ?? []),
    ])
    const made = createInsight(
      {
        id: newId(),
        projectId,
        theme,
        statement: texts.statement,
        description: texts.description,
        counterEvidence: texts.counterEvidence,
        minorityView: texts.minorityView,
        translation: from ? 'translating' : 'done',
        support: input.support,
        counter: input.counter ?? [],
      },
      context,
    )
    if (!made.ok) return made
    await deps.store.saveInsight({ ...made.value, pendingTranslation: pending }, null)
    await translate(accountId, made.value, from, toTranslate)
    return ok({ id: made.value.id, version: made.value.version })
  }

  /** FR-010: link a fact as support or counter, change its role, or accept a suggested one. */
  const link = (
    accountId: string,
    projectId: string,
    insightId: string,
    factId: string,
    input: { version: number; role: 'support' | 'counter' },
  ) =>
    change(accountId, projectId, insightId, input.version, async (i, project) =>
      linkFact(i, factId, input.role, await contextOf(accountId, project, factIdsOf(i, [factId]))),
    )

  /** FR-010: unlink a fact, or dismiss a suggested one; no run links it again. */
  const unlink = (
    accountId: string,
    projectId: string,
    insightId: string,
    factId: string,
    version: number,
  ) =>
    change(accountId, projectId, insightId, version, async (i, project) => {
      if (!i.links.some((l) => l.factId === factId && l.state !== 'unlinked'))
        return err('INSIGHT_NOT_FOUND')
      return unlinkFact(i, factId, await contextOf(accountId, project, factIdsOf(i)))
    })

  /** FR-012: "Reviewed" takes the linked facts as they are now. */
  const reviewed = (accountId: string, projectId: string, insightId: string, version: number) =>
    change(accountId, projectId, insightId, version, async (i, project) =>
      markReviewed(i, await contextOf(accountId, project, factIdsOf(i))),
    )

  /**
   * A failed translation is tried again on request: the fields the person wrote, from the language
   * they wrote them in (whoever asks again).
   */
  const retryTranslation = async (
    accountId: string,
    projectId: string,
    insightId: string,
    version: number,
  ) => {
    const project = await projectOf(deps, accountId, projectId)
    if (!project.ok) return project
    const insight = await deps.store.getInsight(insightId)
    if (!insight || insight.projectId !== projectId) return err('INSIGHT_NOT_FOUND' as const)
    if (insight.version !== version) return err('VERSION_CONFLICT' as const)
    if (insight.translation !== 'not-translated') return ok({ version })
    const from = insight.pendingTranslation?.from ?? (await deps.sources.language(accountId))
    const fields = insight.pendingTranslation?.fields ?? FIELDS
    const texts: TranslatedTexts = Object.fromEntries(
      fields.map((f) => [f, insight[f][from]]).filter(([, t]) => t),
    )
    const nothing = Object.keys(texts).length === 0
    const next: Insight = {
      ...insight,
      translation: nothing ? 'done' : 'translating',
      ...(nothing ? { pendingTranslation: null } : {}),
      version: version + 1,
    }
    if ((await deps.store.saveInsight(next, version)) === 'stale')
      return err('VERSION_CONFLICT' as const)
    if (!nothing) await translate(accountId, next, from, texts)
    return ok({ version: next.version })
  }

  /** Saves a translation's outcome, again on the insight as it is when it changed meanwhile. */
  const saveTranslation = async (
    job: InsightTranslateJob,
    apply: (insight: Insight) => Insight,
  ) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const insight = await deps.store.getInsight(job.insightId)
      if (!insight || !wordsStill(insight, job)) return
      if ((await deps.store.saveInsight(apply(insight), insight.version)) === 'ok') return
    }
    deps.log.warn({ insightId: job.insightId }, 'insight translation not saved')
  }

  /**
   * The background translation, applied while the person's words are still the insight's. A
   * decision taken meanwhile (a new version) is no reason to drop it: it is applied again on the
   * insight as it is then. A translation too long, or a statement holding a name, is not kept.
   */
  const translateJob = async (job: InsightTranslateJob): Promise<void> => {
    const first = await deps.store.getInsight(job.insightId)
    if (!first || !wordsStill(first, job)) return
    const to = job.from === 'en' ? 'fr' : 'en'
    let translated: TranslatedTexts
    try {
      translated = await deps.ai.translate(job.accountId, insightTranslationRef(first.projectId), {
        texts: job.texts,
        from: job.from,
        to,
      })
    } catch {
      return saveTranslation(job, (insight) => ({
        ...insight,
        translation: 'not-translated',
        version: insight.version + 1,
      }))
    }
    const project = await projectOf(deps, job.accountId, first.projectId)
    const names = project.ok ? await projectNames(deps, job.accountId, project.value.studyIds) : []
    const usable = (field: InsightField) => {
      const text = translated[field]?.trim()
      if (!text || text.length > FIELD_MAX[field]) return null
      return field === 'statement' && holdsName(text, names) ? null : text
    }
    const asked = FIELDS.filter((f) => job.texts[f] !== undefined)
    const missing = asked.filter((f) => usable(f) === null)
    return saveTranslation(job, (insight) => {
      const pick = (field: InsightField) => {
        const text = asked.includes(field) ? usable(field) : null
        return text ? { ...insight[field], [to]: text } : insight[field]
      }
      return {
        ...insight,
        statement: pick('statement'),
        description: pick('description'),
        counterEvidence: pick('counterEvidence'),
        minorityView: pick('minorityView'),
        translation: missing.length > 0 ? 'not-translated' : 'done',
        pendingTranslation: missing.length > 0 ? { from: job.from, fields: missing } : null,
        version: insight.version + 1,
      }
    })
  }

  return {
    decide: decideOne,
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
