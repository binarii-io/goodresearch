import { z } from 'zod'
import { Id, Timestamp, Version } from './common.ts'

/** Limits of a questionnaire (spec 027 FR-004); the research domain enforces the same ones. */
export const QUESTIONNAIRE_LIMITS = {
  sections: 12,
  items: 80,
  hypotheses: 15,
  options: 20,
  text: 600,
  framing: 4000,
  title: 120,
} as const

export const QuestionnaireSectionKind = z.enum(['introduction', 'profiling', 'theme', 'closing'])
export type QuestionnaireSectionKind = z.infer<typeof QuestionnaireSectionKind>

const Text = z.string().trim().min(1).max(QUESTIONNAIRE_LIMITS.text)
const Title = z.string().trim().min(1).max(QUESTIONNAIRE_LIMITS.title)
const FramingText = z.string().trim().max(QUESTIONNAIRE_LIMITS.framing)

const Framing = z.object({
  objective: FramingText,
  hypotheses: z.array(Text).max(QUESTIONNAIRE_LIMITS.hypotheses),
  audience: FramingText,
  recruitment: z.enum(['targeted', 'wide-then-filter']),
  administration: FramingText,
  targetResponses: z.number().int().min(1).nullable(),
  targetReason: FramingText,
  language: z.enum(['en', 'fr']),
  consent: FramingText.min(1),
  thanks: FramingText.min(1),
  shuffle: z.boolean(),
})

const ItemCommon = z.object({
  text: Text,
  measure: z.enum(['factual', 'subjective']),
  required: z.boolean(),
  subTheme: Title.nullable(),
  contact: z.boolean(),
})

const item = <T extends z.ZodRawShape>(common: z.ZodObject<T>) =>
  z.discriminatedUnion('kind', [
    common.extend({
      kind: z.literal('likert'),
      points: z.union([z.literal(5), z.literal(7)]),
      lowLabel: Title,
      highLabel: Title,
    }),
    common.extend({
      kind: z.enum(['single-choice', 'multiple-choice']),
      options: z
        .array(Text)
        .min(2)
        .max(QUESTIONNAIRE_LIMITS.options)
        .refine((all) => new Set(all).size === all.length, { message: 'Two identical options' }),
      ordered: z.boolean(),
    }),
    common.extend({ kind: z.literal('open') }),
  ])

const sections = <S extends z.ZodType<{ items: readonly unknown[] }>>(section: S) =>
  z
    .array(section)
    .min(1)
    .max(QUESTIONNAIRE_LIMITS.sections)
    .refine((all) => all.reduce((n, s) => n + s.items.length, 0) <= QUESTIONNAIRE_LIMITS.items, {
      message: `At most ${QUESTIONNAIRE_LIMITS.items} items`,
    })

const Section = z.object({ kind: QuestionnaireSectionKind, title: Title })

/** Written by the assistant (tool input, model output: never trusted). */
export const QuestionnaireDraft = z.object({
  framing: Framing,
  sections: sections(Section.extend({ items: z.array(item(ItemCommon)) })),
})
export type QuestionnaireDraft = z.infer<typeof QuestionnaireDraft>

/** Sent by the editor: known ids are kept, new items and sections get one. */
export const QuestionnaireContentInput = z.object({
  framing: Framing,
  sections: sections(
    Section.extend({
      id: Id.optional(),
      items: z.array(item(ItemCommon.extend({ id: Id.optional() }))),
    }),
  ),
})
export type QuestionnaireContentInput = z.infer<typeof QuestionnaireContentInput>

export const QuestionnaireContent = z
  .object({
    framing: Framing,
    sections: sections(
      Section.extend({ id: Id, items: z.array(item(ItemCommon.extend({ id: Id }))) }),
    ),
  })
  .meta({ id: 'QuestionnaireContent' })
export type QuestionnaireContent = z.infer<typeof QuestionnaireContent>

/** What the app's fixed rules flag (FR-007); the web app translates the codes. */
export const ItemFlag = z.enum([
  'double',
  'negation',
  'leading',
  'absolute',
  'too-long',
  'factual-on-likert',
  'identifying',
])
export type ItemFlag = z.infer<typeof ItemFlag>

export const QuestionnaireFlag = z.enum([
  'legends-differ',
  'closed-series',
  'no-profiling',
  'too-many-open',
])
export type QuestionnaireFlag = z.infer<typeof QuestionnaireFlag>

export const ReadinessKind = z.enum(['review', 'pre-test'])
export type ReadinessKind = z.infer<typeof ReadinessKind>

export const ReadinessMark = z.object({
  kind: ReadinessKind,
  people: z.number().int().min(1).nullable(),
  by: z.object({ name: z.string() }).nullable(),
  at: Timestamp,
  /** The questionnaire changed since this check was marked. */
  changedSince: z.boolean(),
})
export type ReadinessMark = z.infer<typeof ReadinessMark>

export const Questionnaire = z
  .object({
    studyId: Id,
    content: QuestionnaireContent,
    /** `drive`: changes of the form a person accepted. */
    origin: z.enum(['assistant', 'person', 'drive']),
    updatedBy: z.object({ name: z.string() }).nullable(),
    updatedAt: Timestamp,
    version: Version,
    checks: z.object({
      items: z.record(z.string(), z.array(ItemFlag)),
      whole: z.array(QuestionnaireFlag),
    }),
    /** Computed by the app, shown as an estimate (FR-008). */
    estimatedMinutes: z.number().int(),
    readiness: z.array(ReadinessMark),
    randomisation: z.object({
      optionsShuffled: z.boolean(),
      itemsShuffled: z.boolean(),
      themesFixed: z.boolean(),
    }),
  })
  .meta({ id: 'Questionnaire' })
export type Questionnaire = z.infer<typeof Questionnaire>

/** `version: null` creates the questionnaire; it fails if one was saved meanwhile. */
export const SaveQuestionnaire = z
  .object({ content: QuestionnaireContentInput, version: Version.nullable() })
  .meta({ id: 'SaveQuestionnaire' })

export const MarkReadiness = z
  .object({ people: z.number().int().min(1).max(1000).nullable() })
  .meta({ id: 'MarkReadiness' })

export const ReadinessParams = z.object({ studyId: Id, kind: ReadinessKind })

export const QuestionnaireDesignCost = z
  .object({ currency: z.literal('USD'), total: z.number().nullable() })
  .meta({ id: 'QuestionnaireDesignCost' })
