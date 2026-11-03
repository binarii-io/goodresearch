import { err, holdsName, newId, ok } from '@goodresearch/shared'
import { type GivenStatement, type Polarity, STATEMENT_MAX } from '../../domain/facts.ts'
import {
  createSurveyFact,
  decideSurveyFact,
  figureChanged,
  figureStatement,
  keepFigure,
  type SurveyFact,
  themeStatement,
  updateFigure,
} from '../../domain/survey-facts.ts'
import { AiUnavailable, type TranslateJob } from '../ports.ts'
import type { FigureRef, FigureToday, SurveyFactDeps, ThemeNow } from '../survey-ports.ts'

type Actor = { readonly id: string }

/** Spec 029 research R4: a person's edit of a survey fact, translated under the study's ref. */
export const surveyTranslationRef = (studyId: string) => `facts-translation:survey:${studyId}`
/** FR-010a: every "Find facts" of a survey study, under one ref Surveys sums in its cost. */
export const surveyFindRef = (studyId: string) => `survey-facts:${studyId}`

/** At most this many facts from one "Find facts": each waits for a person's decision. */
const FIND_MAX = 10

/** The same figure or theme, whatever the statement says. */
const supportKey = (
  s: { kind: 'figure'; figure: FigureRef } | { kind: 'theme'; themeId: string },
) =>
  s.kind === 'figure'
    ? `figure|${s.figure.itemId}|${s.figure.measure}|${s.figure.option ?? ''}|${s.figure.cross?.itemId ?? ''}|${s.figure.cross?.option ?? ''}`
    : `theme|${s.themeId}`

/** Spec 029 US4: survey facts, made by a person from a figure or an accepted theme. */
export const makeSurveyFactCommands = (deps: SurveyFactDeps) => {
  const now = () => deps.clock.now()

  const surveyStudy = async (accountId: string, studyId: string) => {
    const access = await deps.studyAccess(accountId, studyId)
    if (!access) return err('STUDY_NOT_FOUND' as const)
    if (access.type !== 'survey') return err('NOT_A_SURVEY_STUDY' as const)
    return ok(access)
  }

  const factIn = async (actor: Actor, studyId: string, factId: string) => {
    const study = await surveyStudy(actor.id, studyId)
    if (!study.ok) return study
    const fact = await deps.store.get(factId)
    if (!fact || fact.studyId !== studyId) return err('FACT_NOT_FOUND' as const)
    return ok(fact)
  }

  const translateLater = async (actor: Actor, fact: SurveyFact, given?: GivenStatement) => {
    if (fact.translation !== 'translating') return
    if ((given?.en === undefined) === (given?.fr === undefined)) return
    const from = given?.en !== undefined ? 'en' : 'fr'
    await deps.enqueueTranslation({
      factId: fact.id,
      version: fact.version,
      accountId: actor.id,
      from,
      text: fact.statement[from],
      survey: true,
    })
  }

  /** A figure or theme with a fact still standing (not rejected) gets no second one. */
  const standing = async (studyId: string, key: string) =>
    (await deps.store.allOf(studyId)).some(
      (f) => f.status !== 'rejected' && supportKey(f.support) === key,
    )

  /** One "Find facts" per study at a time in this process: a second click finds nothing new. */
  const finding = new Set<string>()

  const insertFigure = async (
    actor: Actor,
    studyId: string,
    found: FigureToday,
    polarity: Polarity,
    origin: 'ai' | 'person' = 'person',
  ) => {
    const at = now()
    const fact = createSurveyFact({
      id: newId(),
      studyId,
      support: { kind: 'figure', itemId: found.snapshot.itemId, figure: found.snapshot },
      statement: figureStatement(found.snapshot, found.context),
      polarity,
      theme: found.section,
      by: actor.id,
      now: at,
      origin,
    })
    await deps.store.insert(fact, at)
    return fact
  }

  const insertTheme = async (
    actor: Actor,
    studyId: string,
    themeId: string,
    theme: ThemeNow,
    polarity: Polarity,
    origin: 'ai' | 'person' = 'person',
  ) => {
    const at = now()
    const fact = createSurveyFact({
      id: newId(),
      studyId,
      support: {
        kind: 'theme',
        itemId: theme.itemId,
        themeId,
        share: theme.share,
        quotes: theme.quotes.slice(0, 5),
      },
      statement: themeStatement(theme),
      polarity,
      theme: theme.section,
      by: actor.id,
      now: at,
      origin,
    })
    await deps.store.insert(fact, at)
    return fact
  }

  const findNow = async (actor: Actor, studyId: string) => {
    const study = await surveyStudy(actor.id, studyId)
    if (!study.ok) return study
    if ((await deps.ai.providerOf(actor.id)) === null) return err('AI_PROVIDER_REQUIRED' as const)
    const input = await deps.surveys.findingInput(actor.id, studyId)
    if (!input.ok) return input
    if (input.value.counted === 0) return err('NO_COUNTED_RESPONSE' as const)
    const existing = await deps.store.allOf(studyId)
    const taken = new Set(existing.map((f) => supportKey(f.support)))
    let proposed: Awaited<ReturnType<typeof deps.ai.surveyFacts>>
    try {
      proposed = await deps.ai.surveyFacts(actor.id, surveyFindRef(studyId), {
        figures: input.value.figures,
        themes: input.value.themes,
        existing: existing.map((f) => `${f.status}: ${f.statement.en}`),
      })
    } catch (error) {
      deps.log.warn({ error: String(error), studyId }, 'survey facts not found')
      return err(
        error instanceof AiUnavailable ? ('AI_PROVIDER_REQUIRED' as const) : ('AI_FAILED' as const),
      )
    }
    const themeIds = new Set(input.value.themes.map((t) => t.id))
    const refs: { ref: FigureRef; polarity: Polarity }[] = []
    const themes: { themeId: string; polarity: Polarity }[] = []
    for (const p of proposed) {
      if (p.figure) {
        const ref: FigureRef = {
          itemId: p.figure.itemId,
          measure: p.figure.measure,
          ...(p.figure.measure === 'option' && p.figure.option ? { option: p.figure.option } : {}),
        }
        const key = supportKey({ kind: 'figure', figure: ref })
        if (taken.has(key)) continue
        taken.add(key)
        refs.push({ ref, polarity: p.polarity })
      } else if (p.themeId && themeIds.has(p.themeId)) {
        const key = supportKey({ kind: 'theme', themeId: p.themeId })
        if (taken.has(key)) continue
        taken.add(key)
        themes.push({ themeId: p.themeId, polarity: p.polarity })
      }
    }
    // Never trust AI output: a figure the app does not compute, or a theme no longer accepted, is out.
    const today = refs.length
      ? await deps.surveys.figures(
          actor.id,
          studyId,
          refs.map((r) => r.ref),
        )
      : ok([])
    if (!today.ok) return today
    let created = 0
    for (const [i, found] of today.value.entries()) {
      if (!found || created >= FIND_MAX) continue
      await insertFigure(actor, studyId, found, refs[i]?.polarity ?? 'neutral', 'ai')
      created += 1
    }
    for (const t of themes) {
      if (created >= FIND_MAX) break
      const theme = await deps.surveys.theme(actor.id, studyId, t.themeId)
      if (theme?.status !== 'accepted') continue
      await insertTheme(actor, studyId, t.themeId, theme, t.polarity, 'ai')
      created += 1
    }
    return ok({ created, leftOut: proposed.length - created })
  }

  return {
    /** FR-010: a fact from today's figure or an accepted theme, proposed. */
    create: async (
      actor: Actor,
      studyId: string,
      input: {
        from: { figure: FigureRef } | { theme: { themeId: string } }
        polarity: Polarity
      },
    ) => {
      const study = await surveyStudy(actor.id, studyId)
      if (!study.ok) return study
      if ('figure' in input.from) {
        const today = await deps.surveys.figures(actor.id, studyId, [input.from.figure])
        if (!today.ok) return today
        const found = today.value[0]
        if (!found) return err('FIGURE_NOT_FOUND' as const)
        if (await standing(studyId, supportKey({ kind: 'figure', figure: found.snapshot })))
          return err('FACT_EXISTS' as const)
        return ok(await insertFigure(actor, studyId, found, input.polarity))
      }
      const theme = await deps.surveys.theme(actor.id, studyId, input.from.theme.themeId)
      if (!theme) return err('THEME_NOT_FOUND' as const)
      if (theme.status !== 'accepted') return err('THEME_NOT_ACCEPTED' as const)
      if (await standing(studyId, supportKey({ kind: 'theme', themeId: input.from.theme.themeId })))
        return err('FACT_EXISTS' as const)
      return ok(await insertTheme(actor, studyId, input.from.theme.themeId, theme, input.polarity))
    },

    /** FR-010a: what "Find facts" would send and cost, before a person confirms it. */
    estimateFind: async (actor: Actor, studyId: string) => {
      const study = await surveyStudy(actor.id, studyId)
      if (!study.ok) return study
      const input = await deps.surveys.findingInput(actor.id, studyId)
      if (!input.ok) return input
      const { figures, themes, figureCount } = input.value
      const chars =
        figures.length + themes.reduce((n, t) => n + t.label.length + t.description.length + 60, 0)
      const [cost, provider] = await Promise.all([
        deps.ai.surveyEstimate(actor.id, chars),
        deps.ai.providerOf(actor.id),
      ])
      return ok({
        figures: figureCount,
        themes: themes.length,
        cost,
        aiConnected: provider !== null,
      })
    },

    /**
     * FR-010a: the AI picks the figures and accepted themes worth a fact; the app checks each one
     * against today's figures, writes its statement and proposes it. A figure or theme that already
     * has a fact, decided or not, is left out.
     */
    find: async (actor: Actor, studyId: string) => {
      if (finding.has(studyId)) return err('RUN_IN_PROGRESS' as const)
      finding.add(studyId)
      try {
        return await findNow(actor, studyId)
      } finally {
        finding.delete(studyId)
      }
    },

    /** FR-011: accept, reject or edit with the version seen; an edit is translated behind. */
    decide: async (
      actor: Actor,
      studyId: string,
      factId: string,
      d: {
        decision: 'accept' | 'reject' | 'edit'
        version: number
        statement?: GivenStatement | undefined
        polarity?: Polarity | undefined
      },
    ) => {
      const found = await factIn(actor, studyId, factId)
      if (!found.ok) return found
      const names = await deps.knownNames(actor.id, studyId)
      const next = decideSurveyFact(found.value, d, actor.id, now(), names)
      if (!next.ok) return next
      if ((await deps.store.save(next.value, found.value.version)) !== 'ok')
        return err('VERSION_CONFLICT' as const)
      await translateLater(actor, next.value, d.statement)
      return ok(next.value)
    },

    /** FR-012: update a figure's fact to today's figure, or keep it as it was. */
    figure: async (
      actor: Actor,
      studyId: string,
      factId: string,
      d: { action: 'update' | 'keep'; version: number },
    ) => {
      const found = await factIn(actor, studyId, factId)
      if (!found.ok) return found
      const fact = found.value
      if (fact.support.kind !== 'figure') return err('FIGURE_NOT_FOUND' as const)
      const { figure } = fact.support
      const today = await deps.surveys.figures(actor.id, studyId, [figure])
      if (!today.ok) return today
      const now_ = today.value[0]
      if (!now_) return err('ITEM_REMOVED' as const)
      if (!figureChanged(figure, now_.snapshot)) return err('FIGURE_UNCHANGED' as const)
      const next =
        d.action === 'update'
          ? updateFigure(fact, now_.snapshot, now_.context, d.version, actor.id, now())
          : keepFigure(fact, now_.snapshot, d.version, now())
      if (!next.ok) return next
      if ((await deps.store.save(next.value, fact.version)) !== 'ok')
        return err('VERSION_CONFLICT' as const)
      return ok(next.value)
    },

    /** Research R4: the other language of a person's statement, in the worker. */
    translateJob: async (job: TranslateJob): Promise<void> => {
      const fact = await deps.store.get(job.factId)
      if (!fact || fact.statement[job.from] !== job.text || fact.translation !== 'translating')
        return
      const to = job.from === 'en' ? 'fr' : 'en'
      let translated: string | null = null
      try {
        const text = await deps.translate(job.accountId, surveyTranslationRef(fact.studyId), {
          text: fact.statement[job.from],
          from: job.from,
          to,
        })
        const names = await deps.knownNames(job.accountId, fact.studyId)
        const clean = text.trim().slice(0, STATEMENT_MAX)
        translated = clean.length > 0 && !holdsName(clean, names) ? clean : null
      } catch (error) {
        deps.log.warn({ error: String(error), factId: fact.id }, 'translation failed')
      }
      await deps.store.save(
        translated === null
          ? { ...fact, translation: 'not-translated' }
          : { ...fact, statement: { ...fact.statement, [to]: translated }, translation: 'done' },
        fact.version,
      )
    },
  }
}

export type SurveyFactCommands = ReturnType<typeof makeSurveyFactCommands>
