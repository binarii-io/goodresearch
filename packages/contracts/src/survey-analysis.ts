import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'
import { FactOrigin, FactStatus, Polarity, Statement, Theme, Translation } from './facts.ts'

/** Spec 029: a share in percent, one decimal; null when the base is under 5. */
const Share = z.number().nullable()

/** One column of a figure: the whole item, or the respondents of one profiling option. */
export const FigureColumn = z
  .object({
    base: z.number().int(),
    /** Base under 30. */
    smallBase: z.boolean(),
    options: z
      .array(z.object({ value: z.string(), count: z.number().int(), percent: Share }))
      .optional(),
    /** Values not among the options (written by hand in the form). */
    other: z.object({ count: z.number().int(), percent: Share }).optional(),
    points: z
      .array(z.object({ point: z.number().int(), count: z.number().int(), percent: Share }))
      .optional(),
    mean: z.number().nullable().optional(),
    median: z.number().nullable().optional(),
    agree: Share.optional(),
    disagree: Share.optional(),
  })
  .meta({ id: 'FigureColumn' })

export const Figure = z
  .object({
    itemId: Id,
    text: z.string(),
    kind: z.enum(['single-choice', 'multiple-choice', 'likert']),
    /** Multiple choice: shares over respondents, which may add up to more than 100 %. */
    multiple: z.boolean(),
    points: z.number().int().nullable(),
    lowLabel: z.string().nullable(),
    highLabel: z.string().nullable(),
    /** Responses that answered a former wording of the item (spec 028). */
    formerWording: z.number().int(),
    total: FigureColumn,
    /** With a cross: one column per option of the profiling item. */
    columns: z.array(FigureColumn.extend({ option: z.string() })).nullable(),
  })
  .meta({ id: 'Figure' })

export const ThemeRunView = z
  .object({
    id: Id,
    itemId: Id,
    state: z.enum(['running', 'done', 'failed', 'stopped']),
    parts: z.number().int(),
    partsDone: z.number().int(),
    answersSent: z.number().int(),
    leftOut: z.number().int(),
    droppedQuotes: z.number().int(),
    droppedThemes: z.number().int(),
    failure: z.string().nullable(),
    startedAt: Timestamp,
    finishedAt: Timestamp.nullable(),
  })
  .meta({ id: 'ThemeRunView' })

export const SurveyAnalysis = z
  .object({
    counts: z.object({ counted: z.number().int(), setAside: z.number().int() }),
    crossBy: Id.nullable(),
    /** The profiling choice items a person can cross by. */
    crossable: z.array(z.object({ id: Id, text: z.string() })),
    sections: z.array(
      z.object({ id: Id, title: z.string(), kind: z.string(), figures: z.array(Figure) }),
    ),
    openItems: z.array(
      z.object({
        id: Id,
        text: z.string(),
        sectionId: Id,
        answers: z.number().int(),
        themed: z.number().int(),
        themes: z.number().int(),
        cost: z.number().nullable(),
      }),
    ),
    run: ThemeRunView.nullable(),
    /** Every AI call of the analysis: themes and translations. Null when a price is unknown. */
    cost: z.number().nullable(),
  })
  .meta({ id: 'SurveyAnalysis' })

export const SurveyAnalysisQuery = z.object({ crossBy: Id.optional() })

// Open answers and themes.

export const OpenItemParams = z.object({ studyId: Id, itemId: Id })

export const OpenAnswersQuery = z.object({
  /** A theme id, `none` for answers in no theme, nothing for all. */
  theme: z.union([Id, z.literal('none')]).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
})

export const OpenAnswersPage = z
  .object({
    answers: z.array(
      z.object({ responseId: z.string(), text: z.string(), themeId: Id.nullable() }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    /** Answers with nothing left after masking. */
    leftOut: z.number().int(),
  })
  .meta({ id: 'OpenAnswersPage' })

export const SurveyTheme = z
  .object({
    id: Id,
    itemId: Id,
    label: Statement,
    description: Statement,
    translation: Translation,
    origin: FactOrigin,
    status: z.enum(['proposed', 'accepted', 'rejected']),
    answers: z.number().int(),
    quotes: z.array(z.string()),
    decidedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    decidedAt: Timestamp.nullable(),
    version: Version,
  })
  .meta({ id: 'SurveyTheme' })

export const SurveyThemes = z
  .object({ themes: z.array(SurveyTheme), unthemed: z.number().int(), answers: z.number().int() })
  .meta({ id: 'SurveyThemes' })

export const ThemesEstimateQuery = z.object({
  onlyNew: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export const ThemesEstimate = z
  .object({
    answers: z.number().int(),
    parts: z.number().int(),
    cost: z.number().nullable(),
    aiConnected: z.boolean(),
    consentNeeded: z.boolean(),
  })
  .meta({ id: 'ThemesEstimate' })

export const StartThemesRun = z
  .object({ onlyNew: z.boolean().default(false), consent: z.boolean().default(false) })
  .meta({ id: 'StartThemesRun' })

export const ThemesRunStarted = z.object({ runId: Id }).meta({ id: 'ThemesRunStarted' })

const Label = z.string().trim().min(1).max(80)
const Description = z.string().trim().min(1).max(400)

export const DecideSurveyTheme = z
  .object({
    decision: z.enum(['accept', 'reject', 'edit']),
    version: Version,
    /** At least one language on edit; the other is translated. */
    label: z.object({ en: Label.optional(), fr: Label.optional() }).optional(),
    description: z.object({ en: Description.optional(), fr: Description.optional() }).optional(),
  })
  .meta({ id: 'DecideSurveyTheme' })

export const MergeSurveyThemes = z
  .object({ from: z.array(Id).min(1).max(20), version: Version })
  .meta({ id: 'MergeSurveyThemes' })

export const MoveOpenAnswer = z
  .object({ responseId: z.string().min(1).max(200), to: Id.nullable() })
  .meta({ id: 'MoveOpenAnswer' })

export const SurveyThemeParams = z.object({ studyId: Id, themeId: Id })

// Survey facts.

export const FigureMeasure = z.enum(['option', 'agree', 'disagree', 'mean'])

/** A figure of the Analysis tab, as a person points at it. */
export const FigureRef = z
  .object({
    itemId: Id,
    measure: FigureMeasure,
    option: z.string().min(1).max(600).optional(),
    cross: z.object({ itemId: Id, option: z.string().min(1).max(600) }).optional(),
  })
  .meta({ id: 'FigureRef' })

export const FigureSnapshot = FigureRef.extend({
  value: z.number(),
  base: z.number().int(),
  smallBase: z.boolean(),
  ruleVersion: z.number().int().nullable(),
}).meta({ id: 'FigureSnapshot' })

export const SurveySupport = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('figure'),
      itemId: Id,
      itemText: z.string(),
      figure: FigureSnapshot,
    }),
    z.object({
      kind: z.literal('theme'),
      itemId: Id,
      itemText: z.string(),
      themeId: Id,
      share: z.object({ answers: z.number().int(), base: z.number().int() }),
      quotes: z.array(z.string()),
    }),
  ])
  .meta({ id: 'SurveySupport' })

export const SurveyFact = z
  .object({
    id: Id,
    statement: Statement,
    translation: Translation,
    polarity: Polarity,
    theme: Theme.nullable(),
    support: SurveySupport,
    /** Today's figure when it differs from the snapshot. */
    figureChanged: z.object({ value: z.number(), base: z.number().int() }).nullable(),
    itemRemoved: z.boolean(),
    origin: FactOrigin,
    status: FactStatus,
    decidedBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
    decidedAt: Timestamp.nullable(),
    version: Version,
  })
  .meta({ id: 'SurveyFact' })

export const SurveyFactsQuery = z.object({
  status: z.enum(['to-decide', 'accepted', 'rejected', 'all']).optional(),
  page: z.coerce.number().int().min(1).max(1_000).default(1),
})

export const SurveyFactsPage = z
  .object({
    facts: z.array(SurveyFact),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'SurveyFactsPage' })

export const CreateSurveyFact = z
  .object({
    from: z.union([
      z.object({ figure: FigureRef }),
      z.object({ theme: z.object({ themeId: Id }) }),
    ]),
    polarity: Polarity.default('neutral'),
  })
  .meta({ id: 'CreateSurveyFact' })

const StatementText = z.string().trim().min(1).max(200)

export const DecideSurveyFact = z
  .object({
    decision: z.enum(['accept', 'reject', 'edit']),
    version: Version,
    statement: z.object({ en: StatementText.optional(), fr: StatementText.optional() }).optional(),
    polarity: Polarity.optional(),
  })
  .meta({ id: 'DecideSurveyFact' })

export const SurveyFactFigure = z
  .object({ action: z.enum(['update', 'keep']), version: Version })
  .meta({ id: 'SurveyFactFigure' })

export const SurveyFactParams = z.object({ factId: Id })

/** Spec 029 FR-010a: what "Find facts" would send (figures and accepted themes) and cost. */
export const SurveyFactsFindEstimate = z
  .object({
    figures: z.number().int(),
    themes: z.number().int(),
    cost: z.number().nullable(),
    aiConnected: z.boolean(),
  })
  .meta({ id: 'SurveyFactsFindEstimate' })

export const SurveyFactsFound = z
  .object({ created: z.number().int(), leftOut: z.number().int() })
  .meta({ id: 'SurveyFactsFound' })
