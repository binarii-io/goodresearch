import { err, ok, type Result } from '@goodresearch/shared'
import {
  type FactError,
  type FactStatus,
  type GivenStatement,
  type Polarity,
  STATEMENT_MAX,
  type Statement,
  statementOf,
  type Theme,
  type Translation,
} from './facts.ts'

/** Spec 029: a figure of the Analysis tab, as it was when the fact was made (a snapshot). */
export type FigureSnapshot = {
  readonly itemId: string
  readonly measure: 'option' | 'agree' | 'disagree' | 'mean'
  readonly option?: string | undefined
  readonly cross?: { readonly itemId: string; readonly option: string } | undefined
  readonly value: number
  readonly base: number
  readonly smallBase: boolean
  readonly ruleVersion: number | null
  /** The figure a person saw when keeping this snapshot: the flag stays down while it holds. */
  readonly kept?: { readonly value: number; readonly base: number } | undefined
}

export type SurveySupport =
  | { readonly kind: 'figure'; readonly itemId: string; readonly figure: FigureSnapshot }
  | {
      readonly kind: 'theme'
      readonly itemId: string
      readonly themeId: string
      readonly share: { readonly answers: number; readonly base: number }
      readonly quotes: readonly string[]
    }

/** A Fact of a survey (context map, spec 029): no session, no verbatim, a support instead. */
export type SurveyFact = {
  readonly id: string
  readonly studyId: string
  readonly statement: Statement
  readonly translation: Translation
  readonly polarity: Polarity
  readonly theme: Theme
  readonly support: SurveySupport
  readonly origin: 'ai' | 'person'
  readonly status: FactStatus
  readonly decidedBy: string | null
  readonly decidedAt: Date | null
  readonly version: number
  /** A person kept the snapshot though today's figure differed. */
  readonly keptAt: Date | null
}

/** The texts a figure's statement names. */
export type FigureContext = {
  readonly itemText: string
  readonly crossItemText: string | null
  readonly points: number | null
}

const cut = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`
const number = (n: number, lang: 'en' | 'fr') =>
  lang === 'en'
    ? String(Math.round(n * 10) / 10)
    : String(Math.round(n * 10) / 10).replace('.', ',')
const q = (text: string, lang: 'en' | 'fr') => (lang === 'en' ? `“${text}”` : `« ${text} »`)

/** Every text shortened by the same rule until the statement fits (FR-010). */
const fitted = (write: (len: number) => string) => {
  for (const len of [120, 80, 60, 40, 25, 15]) {
    const s = write(len)
    if (s.length <= STATEMENT_MAX) return s
  }
  return cut(write(10), STATEMENT_MAX)
}

const phrase = (s: FigureSnapshot, c: FigureContext, lang: 'en' | 'fr', len: number) => {
  const v = number(s.value, lang)
  const item = q(cut(c.itemText, len), lang)
  const base = s.base
  const body =
    s.measure === 'mean'
      ? lang === 'en'
        ? `${item}: mean of ${v} out of ${c.points ?? '?'}, over ${base} respondents`
        : `${item} : moyenne de ${v} sur ${c.points ?? '?'}, sur ${base} répondants`
      : s.measure === 'agree'
        ? lang === 'en'
          ? `${v} % of the ${base} respondents agree with ${item}`
          : `${v} % des ${base} répondants sont d’accord avec ${item}`
        : s.measure === 'disagree'
          ? lang === 'en'
            ? `${v} % of the ${base} respondents disagree with ${item}`
            : `${v} % des ${base} répondants ne sont pas d’accord avec ${item}`
          : lang === 'en'
            ? `${v} % of the ${base} respondents answered ${q(cut(s.option ?? '', len), lang)} to ${item}`
            : `${v} % des ${base} répondants ont répondu ${q(cut(s.option ?? '', len), lang)} à ${item}`
  const cross = s.cross
    ? lang === 'en'
      ? `Among the respondents who answered ${q(cut(s.cross.option, len), lang)} to ${q(cut(c.crossItemText ?? '', len), lang)}, `
      : `Parmi les répondants ayant répondu ${q(cut(s.cross.option, len), lang)} à ${q(cut(c.crossItemText ?? '', len), lang)}, `
    : ''
  const small = s.smallBase ? (lang === 'en' ? ' (small base)' : ' (petite base)') : ''
  return `${cross}${body}${small}.`
}

/** Clarification 2026-11-03: a figure's statement comes from a template, never from AI. */
export const figureStatement = (s: FigureSnapshot, c: FigureContext): Statement => ({
  en: fitted((len) => phrase(s, c, 'en', len)),
  fr: fitted((len) => phrase(s, c, 'fr', len)),
})

/** A theme's fact takes its description, or its label when the description is too long. */
export const themeStatement = (theme: { label: Statement; description: Statement }): Statement => {
  const pick = (lang: 'en' | 'fr') => {
    const d = theme.description[lang].trim()
    return d.length <= STATEMENT_MAX ? d : cut(`${theme.label[lang].trim()}.`, STATEMENT_MAX)
  }
  return { en: pick('en'), fr: pick('fr') }
}

/** FR-010: made by a person from a figure or a theme; proposed, then validated. */
export const createSurveyFact = (input: {
  readonly id: string
  readonly studyId: string
  readonly support: SurveySupport
  readonly statement: Statement
  readonly polarity: Polarity
  readonly theme: Theme
  readonly by: string
  readonly now: Date
  /** Spec 029 FR-010a: proposed by "Find facts" rather than made by a person. */
  readonly origin?: 'ai' | 'person'
}): SurveyFact => ({
  id: input.id,
  studyId: input.studyId,
  statement: input.statement,
  translation: 'done',
  polarity: input.polarity,
  theme: input.theme,
  support: input.support,
  origin: input.origin ?? 'person',
  status: 'proposed',
  decidedBy: null,
  decidedAt: null,
  version: 1,
  keptAt: null,
})

/** FR-011: the decisions of interview facts, without verbatims. */
export const decideSurveyFact = (
  fact: SurveyFact,
  d: {
    readonly decision: 'accept' | 'reject' | 'edit'
    readonly version: number
    readonly statement?: GivenStatement | undefined
    readonly polarity?: Polarity | undefined
  },
  by: string,
  now: Date,
  names: readonly string[],
): Result<SurveyFact, FactError> => {
  if (d.version !== fact.version) return err('VERSION_CONFLICT')
  const decided = { decidedBy: by, decidedAt: now, version: fact.version + 1 }
  if (d.decision !== 'edit')
    return ok({ ...fact, ...decided, status: d.decision === 'accept' ? 'accepted' : 'rejected' })
  const made = statementOf(d.statement ?? {}, fact.statement, names)
  if (!made.ok) return made
  return ok({
    ...fact,
    ...decided,
    status: 'edited',
    statement: made.value.statement,
    translation: made.value.translation ?? fact.translation,
    polarity: d.polarity ?? fact.polarity,
  })
}

const differs = (a: { value: number; base: number }, b: { value: number; base: number }) =>
  Math.round(a.value * 10) !== Math.round(b.value * 10) || a.base !== b.base

/**
 * FR-012: today's figure when it differs from the snapshot, to one decimal; null otherwise, and
 * null while it is the figure a person kept.
 */
export const figureChanged = (
  snapshot: FigureSnapshot,
  today: { value: number; base: number },
): { value: number; base: number } | null =>
  differs(snapshot, today) && (!snapshot.kept || differs(snapshot.kept, today))
    ? { value: today.value, base: today.base }
    : null

/** FR-012: "Update to today": the figure and its statement as they are now. */
export const updateFigure = (
  fact: SurveyFact,
  today: FigureSnapshot,
  c: FigureContext,
  version: number,
  by: string,
  now: Date,
): Result<SurveyFact, 'VERSION_CONFLICT'> => {
  if (version !== fact.version) return err('VERSION_CONFLICT')
  return ok({
    ...fact,
    support: { kind: 'figure', itemId: today.itemId, figure: today },
    statement: figureStatement(today, c),
    translation: 'done',
    decidedBy: by,
    decidedAt: now,
    version: fact.version + 1,
    keptAt: null,
  })
}

/** FR-012: "Keep": the snapshot stays; the flag comes back only if the figure moves again. */
export const keepFigure = (
  fact: SurveyFact,
  today: { value: number; base: number },
  version: number,
  now: Date,
): Result<SurveyFact, 'VERSION_CONFLICT'> =>
  version !== fact.version || fact.support.kind !== 'figure'
    ? err('VERSION_CONFLICT')
    : ok({
        ...fact,
        support: {
          ...fact.support,
          figure: { ...fact.support.figure, kept: { value: today.value, base: today.base } },
        },
        keptAt: now,
        version: fact.version + 1,
      })
