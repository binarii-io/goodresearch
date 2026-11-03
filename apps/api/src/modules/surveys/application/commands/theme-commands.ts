import { err, maskAnswer, newId, ok } from '@goodresearch/shared'
import {
  type CheckedTheme,
  checkThemes,
  MIN_ANSWERS,
  mergeThemes,
  partsOf,
} from '../../domain/themes.ts'
import { type Actor, AiFailed, AiUnavailable, type SurveysDeps, type ThemesAi } from '../ports.ts'
import { themeRunRef, themesTranslationRef } from '../queries/figure-queries.ts'
import { makeSurveyContext } from '../queries/response-queries.ts'
import type {
  StoredTheme,
  ThemeAnswer,
  ThemeRun,
  ThemeStore,
  ThemesJob,
  ThemeTranslationJob,
} from '../theme-ports.ts'

/** The output a part's answer may take, for the estimate (research R8). */
const ANSWER_TOKENS = 3_000
/** A run whose worker stopped sending news is over (as other runs: 10 minutes). */
const RUN_STALE_MS = 10 * 60 * 1000

export type ThemeDeps = SurveysDeps & {
  readonly db: Parameters<typeof makeSurveyContext>[0]['db']
  readonly themes: ThemeStore
  readonly ai: ThemesAi
  /** Names the team knows, never sent (ADR-0012). */
  readonly knownNames: (accountId: string, studyId: string) => Promise<readonly string[]>
  readonly enqueueRun: (job: ThemesJob) => Promise<boolean>
  readonly enqueueTranslation: (job: ThemeTranslationJob) => Promise<boolean>
  readonly log: { warn(object: object, message: string): void }
}

const failureOf = (error: unknown) =>
  error instanceof AiUnavailable
    ? 'AI_PROVIDER_REQUIRED'
    : error instanceof AiFailed && error.invalid
      ? 'INVALID_ANSWER'
      : 'AI_FAILED'

/** Spec 029 US3: themes of an open item's masked answers, proposed by AI, decided by a person. */
export const makeThemeCommands = (deps: ThemeDeps) => {
  const context = makeSurveyContext(deps)
  const now = () => deps.clock.now()

  /** The item's counted answers as they may be sent: masked, those with nothing left out. */
  const sendable = async (accountId: string, studyId: string, itemId: string, onlyNew: boolean) => {
    const c = await context(accountId, studyId)
    if (!c.ok) return c
    const item = c.value.sections.flatMap((s) => s.items).find((i) => i.id === itemId)
    if (!item || item.kind !== 'open' || item.contact) return err('ITEM_NOT_FOUND' as const)
    const fileId = c.value.form?.fileId
    const raw = fileId
      ? await deps.themes.openAnswers(studyId, fileId, c.value.accepted, itemId)
      : []
    const themes = await deps.themes.themesOf(studyId, itemId)
    const live = new Set(themes.filter((t) => t.status !== 'rejected').map((t) => t.id))
    const themed = new Set(
      (await deps.themes.answersOf(studyId, itemId))
        .filter((a) => live.has(a.themeId))
        .map((a) => a.sourceId),
    )
    const names = await deps.knownNames(accountId, studyId)
    const masked = raw
      .filter((a) => !onlyNew || !themed.has(a.sourceId))
      .map((a) => ({ sourceId: a.sourceId, text: maskAnswer(a.text, names) }))
    const answers = masked.flatMap((a) => (a.text === null ? [] : [{ ...a, text: a.text }]))
    return ok({ item, answers, leftOut: masked.length - answers.length, themes })
  }

  const callsOf = (parts: number) => parts + (parts > 1 ? 1 : 0)

  return {
    /** FR-007: what a run would send and cost, before a person confirms it. */
    estimate: async (actor: Actor, studyId: string, itemId: string, onlyNew: boolean) => {
      const s = await sendable(actor.id, studyId, itemId, onlyNew)
      if (!s.ok) return s
      const { answers, item } = s.value
      if (answers.length < MIN_ANSWERS) return err('TOO_FEW_ANSWERS' as const)
      const parts = partsOf(answers).length
      const chars = answers.reduce((n, a) => n + a.text.length + 6, 0) + item.text.length * parts
      const [cost, provider] = await Promise.all([
        deps.ai.estimate(actor.id, chars, ANSWER_TOKENS * parts, callsOf(parts)),
        deps.ai.providerOf(actor.id),
      ])
      return ok({
        answers: answers.length,
        parts,
        cost,
        aiConnected: provider !== null,
        consentNeeded: false,
      })
    },

    /** Starts a run in the worker: one per study at a time, never retried. */
    start: async (actor: Actor, studyId: string, itemId: string, onlyNew: boolean) => {
      if ((await deps.ai.providerOf(actor.id)) === null) return err('AI_PROVIDER_REQUIRED' as const)
      const s = await sendable(actor.id, studyId, itemId, onlyNew)
      if (!s.ok) return s
      if (s.value.answers.length < MIN_ANSWERS) return err('TOO_FEW_ANSWERS' as const)
      const at = now()
      const live = await deps.themes.liveRun(studyId)
      if (live && at.getTime() - live.heartbeatAt.getTime() > RUN_STALE_MS)
        await deps.themes.saveRun({
          ...live,
          state: 'failed',
          failure: 'INTERRUPTED',
          finishedAt: at,
        })
      const run: ThemeRun = {
        id: newId(),
        studyId,
        itemId,
        state: 'running',
        parts: partsOf(s.value.answers).length,
        partsDone: 0,
        answersSent: 0,
        leftOut: s.value.leftOut,
        droppedQuotes: 0,
        droppedThemes: 0,
        failure: null,
        startedBy: actor.id,
        startedAt: at,
        heartbeatAt: at,
        finishedAt: null,
      }
      if ((await deps.themes.startRun(run)) === 'busy') return err('RUN_IN_PROGRESS' as const)
      const queued = await deps.enqueueRun({ runId: run.id, studyId, accountId: actor.id, onlyNew })
      if (!queued) {
        await deps.themes.saveRun({
          ...run,
          state: 'failed',
          failure: 'INTERRUPTED',
          finishedAt: now(),
        })
        return err('RUN_IN_PROGRESS' as const)
      }
      return ok({ runId: run.id })
    },

    /** The worker's side: each part sent, checked, then merged and saved (research R6). */
    runJob: async (job: ThemesJob): Promise<void> => {
      let run = await deps.themes.getRun(job.runId)
      if (!run || run.state !== 'running') return
      const save = async (next: ThemeRun) => {
        run = { ...next, heartbeatAt: now() }
        await deps.themes.saveRun(run)
      }
      try {
        const s = await sendable(job.accountId, job.studyId, run.itemId, job.onlyNew)
        if (!s.ok) {
          await save({ ...run, state: 'failed', failure: 'AI_FAILED', finishedAt: now() })
          return
        }
        const { item, answers, themes } = s.value
        const parts = partsOf(answers)
        const rejected = themes
          .filter((t) => t.status === 'rejected' && !t.mergedInto)
          .flatMap((t) => [t.label.en, t.label.fr])
        const existing = job.onlyNew
          ? themes
              .filter((t) => t.status !== 'rejected')
              .map((t) => ({ id: t.id, label: t.label.en }))
          : []
        let found: CheckedTheme[] = []
        let droppedQuotes = 0
        let droppedThemes = 0
        for (const [i, part] of parts.entries()) {
          const proposed = await deps.ai.themes(job.accountId, themeRunRef(run.id, i), {
            item: item.text,
            answers: part,
            rejected,
            existing,
          })
          const checked = checkThemes(proposed, part, rejected)
          found = [...found, ...checked.themes]
          droppedQuotes += checked.droppedQuotes
          droppedThemes += checked.droppedThemes
          await save({ ...run, partsDone: i + 1, answersSent: run.answersSent + part.length })
        }
        if (parts.length > 1 && found.length > 1) {
          const merges = await deps.ai.merge(
            job.accountId,
            themeRunRef(run.id, parts.length),
            found.map((t, i) => ({
              ref: `t${i + 1}`,
              label: t.label.en,
              description: t.description.en,
            })),
          )
          found = mergeThemes(found, merges)
        }
        const known = new Set(existing.map((e) => e.id))
        const at = now()
        const created: { theme: StoredTheme; answers: ThemeAnswer[] }[] = []
        const joined: ThemeAnswer[] = []
        for (const t of found) {
          if (t.existing && known.has(t.existing)) {
            const themeId = t.existing
            joined.push(...t.answers.map((a) => ({ themeId, ...a })))
            continue
          }
          const id = newId()
          created.push({
            theme: {
              id,
              studyId: job.studyId,
              itemId: run.itemId,
              label: t.label,
              description: t.description,
              translation: 'done',
              origin: 'ai',
              status: 'proposed',
              mergedInto: null,
              version: 1,
              runId: run.id,
              decidedBy: null,
              decidedAt: null,
              createdAt: at,
            },
            answers: t.answers.map((a) => ({ themeId: id, ...a })),
          })
        }
        await deps.themes.addThemes(created, joined)
        await save({ ...run, state: 'done', droppedQuotes, droppedThemes, finishedAt: now() })
      } catch (error) {
        deps.log.warn({ error: String(error), runId: job.runId }, 'theme run failed')
        await save({ ...run, state: 'failed', failure: failureOf(error), finishedAt: now() })
      }
    },

    /** FR-009: accept, reject or edit a theme with the version seen; an edit is translated. */
    decide: async (
      actor: Actor,
      studyId: string,
      themeId: string,
      d: {
        decision: 'accept' | 'reject' | 'edit'
        version: number
        label?: { en?: string | undefined; fr?: string | undefined } | undefined
        description?: { en?: string | undefined; fr?: string | undefined } | undefined
      },
    ) => {
      const c = await context(actor.id, studyId)
      if (!c.ok) return c
      const theme = await deps.themes.getTheme(themeId)
      if (!theme || theme.studyId !== studyId) return err('THEME_NOT_FOUND' as const)
      if (d.version !== theme.version) return err('VERSION_CONFLICT' as const)
      const decided = { decidedBy: actor.id, decidedAt: now(), version: theme.version + 1 }
      let next: StoredTheme
      let from: 'en' | 'fr' | null = null
      if (d.decision !== 'edit')
        next = { ...theme, ...decided, status: d.decision === 'accept' ? 'accepted' : 'rejected' }
      else {
        const en = d.label?.en !== undefined || d.description?.en !== undefined
        const fr = d.label?.fr !== undefined || d.description?.fr !== undefined
        if (!en && !fr) return err('VALIDATION' as const)
        from = en !== fr ? (en ? 'en' : 'fr') : null
        next = {
          ...theme,
          ...decided,
          // A theme a person edits is accepted: they made it theirs.
          status: 'accepted',
          label: {
            en: d.label?.en?.trim() ?? theme.label.en,
            fr: d.label?.fr?.trim() ?? theme.label.fr,
          },
          description: {
            en: d.description?.en?.trim() ?? theme.description.en,
            fr: d.description?.fr?.trim() ?? theme.description.fr,
          },
          translation: from ? 'translating' : theme.translation,
        }
      }
      if ((await deps.themes.saveTheme(next, theme.version)) !== 'ok')
        return err('VERSION_CONFLICT' as const)
      if (from) {
        const lang = from
        await deps.enqueueTranslation({
          themeId,
          version: next.version,
          accountId: actor.id,
          from: lang,
          fields: [
            ...(d.label?.[lang] !== undefined ? (['label'] as const) : []),
            ...(d.description?.[lang] !== undefined ? (['description'] as const) : []),
          ],
        })
      }
      return ok(next)
    },

    /** FR-009: themes of the same item merged into one; their answers move to it. */
    merge: async (
      actor: Actor,
      studyId: string,
      themeId: string,
      d: { from: readonly string[]; version: number },
    ) => {
      const c = await context(actor.id, studyId)
      if (!c.ok) return c
      const into = await deps.themes.getTheme(themeId)
      if (!into || into.studyId !== studyId || into.status === 'rejected')
        return err('THEME_NOT_FOUND' as const)
      if (d.version !== into.version) return err('VERSION_CONFLICT' as const)
      const from = await Promise.all(d.from.map((id) => deps.themes.getTheme(id)))
      if (
        from.some((t) => !t || t.studyId !== studyId || t.status === 'rejected' || t.id === into.id)
      )
        return err('THEME_NOT_FOUND' as const)
      if (from.some((t) => t?.itemId !== into.itemId)) return err('NOT_SAME_ITEM' as const)
      if ((await deps.themes.merge(into, from as StoredTheme[], actor.id, now())) !== 'ok')
        return err('VERSION_CONFLICT' as const)
      return ok(undefined)
    },

    /** FR-009: an answer moved to another theme of its item, or out of every theme. */
    move: async (
      actor: Actor,
      d: { studyId: string; itemId: string; responseId: string; to: string | null },
    ) => {
      // Only a counted answer of this item can sit in one of its themes.
      const s = await sendable(actor.id, d.studyId, d.itemId, false)
      if (!s.ok) return s
      if (!s.value.answers.some((a) => a.sourceId === d.responseId))
        return err('RESPONSE_NOT_FOUND' as const)
      if (d.to) {
        const theme = await deps.themes.getTheme(d.to)
        if (!theme || theme.studyId !== d.studyId || theme.status === 'rejected')
          return err('THEME_NOT_FOUND' as const)
        if (theme.itemId !== d.itemId) return err('NOT_SAME_ITEM' as const)
      }
      await deps.themes.moveAnswer(d.studyId, d.itemId, d.responseId, d.to)
      return ok(undefined)
    },

    /** The other language of a person's label and description, in the worker. */
    translateJob: async (job: ThemeTranslationJob): Promise<void> => {
      const theme = await deps.themes.getTheme(job.themeId)
      if (!theme || theme.version !== job.version || theme.translation !== 'translating') return
      const to = job.from === 'en' ? 'fr' : 'en'
      const ref = themesTranslationRef(theme.studyId)
      try {
        const translated = async (field: 'label' | 'description') =>
          job.fields.includes(field)
            ? (
                await deps.ai.translate(job.accountId, ref, {
                  text: theme[field][job.from],
                  from: job.from,
                  to,
                })
              ).trim()
            : theme[field][to]
        const [label, description] = await Promise.all([
          translated('label'),
          translated('description'),
        ])
        await deps.themes.saveTheme(
          {
            ...theme,
            label: { ...theme.label, [to]: label.slice(0, 80) },
            description: { ...theme.description, [to]: description.slice(0, 400) },
            translation: 'done',
          },
          theme.version,
        )
      } catch (error) {
        deps.log.warn({ error: String(error), themeId: theme.id }, 'translation failed')
        await deps.themes.saveTheme({ ...theme, translation: 'not-translated' }, theme.version)
      }
    },
  }
}

export type ThemeCommands = ReturnType<typeof makeThemeCommands>
